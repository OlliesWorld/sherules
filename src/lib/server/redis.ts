import {
	KV_REST_API_TOKEN,
	KV_REST_API_URL,
	REDIS_URL,
	UPSTASH_REDIS_REST_TOKEN,
	UPSTASH_REDIS_REST_URL
} from '$app/env/private';
import { Redis as UpstashRedis } from '@upstash/redis';
import { createClient } from 'redis';

/**
 * The Redis commands SheRules uses (daily limits and the question log).
 * Two kinds of Redis are supported, both adapted to this shape:
 * - REDIS_URL: a standard Redis database (e.g. Vercel's Redis integration), over a connection
 * - KV_REST_API_* / UPSTASH_REDIS_REST_*: Upstash, over HTTPS
 */
export interface RedisStore {
	get(key: string): Promise<unknown>;
	incr(key: string): Promise<number>;
	decr(key: string): Promise<number>;
	expire(key: string, seconds: number): Promise<unknown>;
	lpush(key: string, value: string): Promise<unknown>;
	ltrim(key: string, start: number, stop: number): Promise<unknown>;
}

/** A standard Redis database from a redis:// or rediss:// URL. */
function fromRedisUrl(url: string): RedisStore {
	const client = createClient({
		url,
		socket: {
			connectTimeout: 5000,
			// By default the client retries forever, so a request waiting on Redis would hang.
			// Give up after 3 quick retries instead: the request fails fast (and the page
			// handles that), and the next request starts a fresh connection.
			reconnectStrategy: (retries) => (retries >= 3 ? new Error('Redis unreachable') : 200 * (retries + 1))
		}
	});
	// Without an error listener, a dropped connection would crash the server.
	client.on('error', (err) => console.error('[sherules] Redis connection error:', err.message));

	// One connection per server instance, opened on first use and reused after that.
	// If connecting fails, the next call tries again.
	let connecting: Promise<unknown> | undefined;
	const connected = async () => {
		if (!client.isOpen) {
			connecting ??= client.connect().finally(() => (connecting = undefined));
		}
		await connecting;
		return client;
	};

	return {
		get: async (key) => (await connected()).get(key),
		incr: async (key) => (await connected()).incr(key),
		decr: async (key) => (await connected()).decr(key),
		expire: async (key, seconds) => (await connected()).expire(key, seconds),
		lpush: async (key, value) => (await connected()).lPush(key, value),
		ltrim: async (key, start, stop) => (await connected()).lTrim(key, start, stop)
	};
}

/** An Upstash database over its REST API. */
function fromUpstash(url: string, token: string): RedisStore {
	const client = new UpstashRedis({ url, token });
	return {
		get: (key) => client.get(key),
		incr: (key) => client.incr(key),
		decr: (key) => client.decr(key),
		expire: (key, seconds) => client.expire(key, seconds),
		lpush: (key, value) => client.lpush(key, value),
		ltrim: (key, start, stop) => client.ltrim(key, start, stop)
	};
}

const upstashUrl = KV_REST_API_URL ?? UPSTASH_REDIS_REST_URL;
const upstashToken = KV_REST_API_TOKEN ?? UPSTASH_REDIS_REST_TOKEN;

/** Shared Redis for the question log and daily limits, or null when not configured. */
export const redis: RedisStore | null = REDIS_URL
	? fromRedisUrl(REDIS_URL)
	: upstashUrl && upstashToken
		? fromUpstash(upstashUrl, upstashToken)
		: null;
