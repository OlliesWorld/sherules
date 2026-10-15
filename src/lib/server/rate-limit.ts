import { createHmac } from 'node:crypto';
import type { Redis } from '@upstash/redis';

// Each question costs two Gemini calls (one embedding, one answer): about $0.0015
// typically, $0.004 at worst. Two limits keep the bill predictable on a public site:

/** Free questions per visitor per day. */
export const ASKS_PER_DAY = 5;

/**
 * Questions per day across all visitors. The per-visitor limit can be dodged with many
 * IP addresses; this can't. At ~$0.0015 each, 500 questions is under $1 a day typically.
 */
export const GLOBAL_ASKS_PER_DAY = 500;

export type AskResult = 'ok' | 'visitor_limit' | 'global_limit';

/**
 * What the limits need: Redis to count in, and a secret for hashing IPs.
 * Only the four Redis commands used are required, which also makes this easy to test.
 */
export interface Limiter {
	counter: Pick<Redis, 'get' | 'incr' | 'decr' | 'expire'>;
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
 * A visitor's key for one day. The IP is never stored: it's hashed with a secret
 * (HMAC), so the hash can't be reversed by trying every IP address, and the date is
 * mixed in so the same visitor can't be linked from one day to the next.
 */
function visitorKey(limiter: Limiter, ip: string, day: string): string {
	const id = createHmac('sha256', limiter.secret).update(`${day}:${ip}`).digest('hex');
	return `sherules:asks:${day}:${id}`;
}

function everyoneKey(day: string): string {
	return `sherules:asks:${day}:all`;
}

/** Adds one to a count and returns the new value. INCR is atomic, so quick repeat clicks can't both slip through. */
async function increment(limiter: Limiter, key: string): Promise<number> {
	const count = await limiter.counter.incr(key);
	await limiter.counter.expire(key, KEY_TTL_SECONDS);
	return count;
}

/** How many questions this visitor has left today. */
export async function asksLeft(limiter: Limiter, ip: string): Promise<number> {
	const used = Number((await limiter.counter.get(visitorKey(limiter, ip, today()))) ?? 0);
	return Math.max(0, ASKS_PER_DAY - used);
}

/**
 * Uses up one of today's questions, for this visitor and for the site as a whole.
 * A rejected question doesn't count against either limit.
 */
export async function takeAsk(limiter: Limiter, ip: string): Promise<AskResult> {
	const day = today();

	if ((await increment(limiter, everyoneKey(day))) > GLOBAL_ASKS_PER_DAY) {
		await limiter.counter.decr(everyoneKey(day));
		return 'global_limit';
	}

	const visitor = visitorKey(limiter, ip, day);
	if ((await increment(limiter, visitor)) > ASKS_PER_DAY) {
		await limiter.counter.decr(visitor);
		await limiter.counter.decr(everyoneKey(day));
		return 'visitor_limit';
	}

	return 'ok';
}

/** Gives a question back, e.g. when Gemini failed and the visitor got no answer. */
export async function refundAsk(limiter: Limiter, ip: string): Promise<void> {
	const day = today();
	await limiter.counter.decr(visitorKey(limiter, ip, day));
	await limiter.counter.decr(everyoneKey(day));
}
