import {
	KV_REST_API_TOKEN,
	KV_REST_API_URL,
	UPSTASH_REDIS_REST_TOKEN,
	UPSTASH_REDIS_REST_URL
} from '$app/env/private';
import { Redis } from '@upstash/redis';

// Question log in Upstash Redis, same approach as SheKnows: each question is pushed onto
// a list as JSON, and the list is trimmed to the newest MAX_LOGS entries.
// Read it with `npm run logs`, or in the Upstash console's Data Browser.
export const LOG_KEY = 'sherules:logs';
const MAX_LOGS = 1000;

export interface QuestionLogEntry {
	question: string;
	sport: string;
	league: string;
	result: 'answered' | 'not_found' | 'rate_limited' | 'error';
	/** Rule refs cited in the answer. */
	citations?: string[];
	/** Rule refs search returned, closest first, with distance. For checking retrieval. */
	retrieved?: { ruleRef: string; distance: number }[];
	/** Time from receiving the question to having an answer. */
	ms?: number;
}

const url = KV_REST_API_URL ?? UPSTASH_REDIS_REST_URL;
const token = KV_REST_API_TOKEN ?? UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

/**
 * Saves one question to the log. Never throws: a logging problem must not break answering.
 * No IP address or other visitor details are logged.
 */
export async function logQuestion(entry: QuestionLogEntry): Promise<void> {
	if (!redis) {
		console.warn('[sherules] Redis not configured, skipping question log');
		return;
	}

	try {
		await redis.lpush(LOG_KEY, JSON.stringify({ ...entry, timestamp: new Date().toISOString() }));
		await redis.ltrim(LOG_KEY, 0, MAX_LOGS - 1);
	} catch (err) {
		console.error('[sherules] Failed to write question log to Redis:', err);
	}
}
