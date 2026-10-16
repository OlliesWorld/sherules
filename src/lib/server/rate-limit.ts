import { createHmac } from 'node:crypto';
import type { RedisStore } from './redis.ts';

/**
 * A daily limit: how many uses each visitor gets, and how many across everyone.
 * The per-visitor limit can be dodged with many IP addresses; the site-wide one can't.
 */
export interface LimitRule {
	/** Part of the Redis key, so each kind of use is counted separately. */
	name: string;
	perVisitor: number;
	perDay: number;
}

/**
 * Typed questions. Each costs two Gemini calls (one embedding, one answer): about $0.0015
 * typically, $0.004 at worst, so 500 a day is under $1 a day typically.
 */
export const ASK_LIMITS: LimitRule = { name: 'asks', perVisitor: 5, perDay: 500 };

/**
 * Voice conversations. A voice session is billed by the minute (speech-to-text, the
 * agent's LLM, text-to-speech), so it costs far more than a typed question.
 */
export const VOICE_LIMITS: LimitRule = { name: 'voice', perVisitor: 3, perDay: 100 };

/** Free questions per visitor per day (shown on the page). */
export const ASKS_PER_DAY = ASK_LIMITS.perVisitor;

export type AskResult = 'ok' | 'visitor_limit' | 'global_limit';

/**
 * What the limits need: Redis to count in, and a secret for hashing IPs.
 * Only the four Redis commands used are required, which also makes this easy to test.
 */
export interface Limiter {
	counter: Pick<RedisStore, 'get' | 'incr' | 'decr' | 'expire'>;
	secret: string;
}

// Counts live in Redis under one key per visitor per day, plus one key per day for
// everyone. Keys delete themselves after two days, so nothing piles up.
const KEY_TTL_SECONDS = 2 * 24 * 60 * 60;

/** Today's date in UTC, e.g. "2026-10-15". The limits reset at midnight UTC. */
function today(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * A visitor's key for one rule and day. The IP is never stored: it's hashed with a secret
 * (HMAC), so the hash can't be reversed by trying every IP address, and the date is
 * mixed in so the same visitor can't be linked from one day to the next.
 */
function visitorKey(limiter: Limiter, rule: LimitRule, ip: string, day: string): string {
	const id = createHmac('sha256', limiter.secret).update(`${day}:${ip}`).digest('hex');
	return `sherules:${rule.name}:${day}:${id}`;
}

function everyoneKey(rule: LimitRule, day: string): string {
	return `sherules:${rule.name}:${day}:all`;
}

/** Adds one to a count and returns the new value. INCR is atomic, so quick repeat clicks can't both slip through. */
async function increment(limiter: Limiter, key: string): Promise<number> {
	const count = await limiter.counter.incr(key);
	await limiter.counter.expire(key, KEY_TTL_SECONDS);
	return count;
}

/** How many uses this visitor has left today. */
export async function asksLeft(limiter: Limiter, ip: string, rule: LimitRule = ASK_LIMITS): Promise<number> {
	const used = Number((await limiter.counter.get(visitorKey(limiter, rule, ip, today()))) ?? 0);
	return Math.max(0, rule.perVisitor - used);
}

/**
 * Uses up one of today's uses, for this visitor and for the site as a whole.
 * A rejected use doesn't count against either limit.
 */
export async function takeAsk(limiter: Limiter, ip: string, rule: LimitRule = ASK_LIMITS): Promise<AskResult> {
	const day = today();
	const everyone = everyoneKey(rule, day);

	if ((await increment(limiter, everyone)) > rule.perDay) {
		await limiter.counter.decr(everyone);
		return 'global_limit';
	}

	const visitor = visitorKey(limiter, rule, ip, day);
	if ((await increment(limiter, visitor)) > rule.perVisitor) {
		await limiter.counter.decr(visitor);
		await limiter.counter.decr(everyone);
		return 'visitor_limit';
	}

	return 'ok';
}

/** Gives a use back, e.g. when Gemini failed and the visitor got no answer. */
export async function refundAsk(limiter: Limiter, ip: string, rule: LimitRule = ASK_LIMITS): Promise<void> {
	const day = today();
	await limiter.counter.decr(visitorKey(limiter, rule, ip, day));
	await limiter.counter.decr(everyoneKey(rule, day));
}
