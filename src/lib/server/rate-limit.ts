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

/**
 * League guesses on the sport page (guess-league.ts): one small Gemini call each, only for
 * questions that don't name a league. Over the limit, the visitor is just asked to pick.
 * Higher than ASK_LIMITS so it never runs out before the visitor's questions do.
 */
export const LEAGUE_GUESS_LIMITS: LimitRule = { name: 'league-guess', perVisitor: 20, perDay: 2000 };

// The mobile app's limits. An app visitor is an install (a signed install token, see
// install-token.ts), not an IP: phones on cellular often share one IP with many strangers.
// Each app rule has its own site-wide count, separate from the website's.

/** Typed questions from the app, per install. */
export const APP_ASK_LIMITS: LimitRule = { name: 'app-asks', perVisitor: 5, perDay: 300 };

/**
 * App questions per IP, across every install on it. Loose enough for a shared carrier IP,
 * but stops one machine minting install tokens for unlimited questions. Only the
 * per-visitor count matters here: APP_ASK_LIMITS has the site-wide cap.
 */
export const APP_IP_CEILING: LimitRule = { name: 'app-ip', perVisitor: 25, perDay: Number.MAX_SAFE_INTEGER };

/** League guesses from the app, per install (see LEAGUE_GUESS_LIMITS). */
export const APP_LEAGUE_GUESS_LIMITS: LimitRule = { name: 'app-league-guess', perVisitor: 20, perDay: 1200 };

/** New install tokens per IP. Reinstalling gets a new token, but only this many a day. */
export const INSTALL_LIMITS: LimitRule = { name: 'app-install', perVisitor: 5, perDay: 5000 };

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

/**
 * Takes one use from each rule in order. If one is over its limit, the uses already taken
 * are given back (newest first) and that rule's result is returned.
 */
export async function takeAll(limiter: Limiter, steps: [LimitRule, string][]): Promise<AskResult> {
	const taken: [LimitRule, string][] = [];
	for (const [rule, id] of steps) {
		const result = await takeAsk(limiter, id, rule);
		if (result !== 'ok') {
			for (const [takenRule, takenId] of taken.reverse()) await refundAsk(limiter, takenId, takenRule);
			return result;
		}
		taken.push([rule, id]);
	}
	return 'ok';
}

/**
 * The daily limits for one visitor, whoever they are (a website IP or an app install).
 * Answering code (ask.ts) only talks to this, so it doesn't care where the limits come from.
 */
export interface LimitGate {
	/** Uses up one question. */
	take(): Promise<AskResult>;
	/** Questions left today. */
	left(): Promise<number>;
	/** Gives a question back (the visitor got no answer). */
	refund(): Promise<void>;
	/** Uses up one league guess (sport page). */
	takeGuess(): Promise<AskResult>;
}

/** The website's limits: counted per IP. */
export function ipGate(limiter: Limiter, ip: string): LimitGate {
	return {
		take: () => takeAsk(limiter, ip),
		left: () => asksLeft(limiter, ip),
		refund: () => refundAsk(limiter, ip),
		takeGuess: () => takeAsk(limiter, ip, LEAGUE_GUESS_LIMITS)
	};
}

// Install ids and IPs are hashed into separate keys per rule name, but prefixing keeps an
// install id from ever colliding with an IP string under the same rule.
const installKey = (installId: string) => `install:${installId}`;

/** The app's limits: counted per install, under a per-IP ceiling. */
export function appGate(limiter: Limiter, installId: string, ip: string): LimitGate {
	const install = installKey(installId);
	return {
		take: () =>
			takeAll(limiter, [
				[APP_IP_CEILING, ip],
				[APP_ASK_LIMITS, install]
			]),
		left: () => asksLeft(limiter, install, APP_ASK_LIMITS),
		refund: async () => {
			await refundAsk(limiter, install, APP_ASK_LIMITS);
			await refundAsk(limiter, ip, APP_IP_CEILING);
		},
		takeGuess: () => takeAsk(limiter, install, APP_LEAGUE_GUESS_LIMITS)
	};
}
