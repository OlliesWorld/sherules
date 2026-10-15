import {
	KV_REST_API_TOKEN,
	KV_REST_API_URL,
	UPSTASH_REDIS_REST_TOKEN,
	UPSTASH_REDIS_REST_URL
} from '$app/env/private';
import { Redis } from '@upstash/redis';

// Vercel's Redis integration sets the KV_* names; a database created directly in
// Upstash uses the UPSTASH_* names. Either works.
const url = KV_REST_API_URL ?? UPSTASH_REDIS_REST_URL;
const token = KV_REST_API_TOKEN ?? UPSTASH_REDIS_REST_TOKEN;

/** Shared Upstash Redis client (question log, daily limits), or null when not configured. */
export const redis = url && token ? new Redis({ url, token }) : null;
