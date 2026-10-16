import {
	GEMINI_API_KEY,
	LIVEKIT_AGENT_NAME,
	LIVEKIT_API_KEY,
	LIVEKIT_API_SECRET,
	LIVEKIT_URL,
	RATE_LIMIT_SECRET,
	TURSO_AUTH_TOKEN,
	TURSO_DATABASE_URL
} from '$app/env/private';
import { GoogleGenAI } from '@google/genai';
import { createDb } from './db.ts';
import { createEmbedder } from './embed.ts';
import type { RagDeps } from './rag.ts';
import type { Limiter } from './rate-limit.ts';
import { redis } from './redis.ts';
import type { VoiceConfig } from './voice.ts';

// One shared set of clients for the whole app, created when the server starts.
// Only SvelteKit code imports this file. Scripts and evals build their own RagDeps
// from process.env, because '$app/env/private' only exists inside SvelteKit.

// The app only reads from Turso, so production can use a read-only token.
export const db = createDb(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN);

export const ragDeps: RagDeps = {
	db,
	embedder: createEmbedder(GEMINI_API_KEY),
	genai: new GoogleGenAI({ apiKey: GEMINI_API_KEY })
};

/** Daily limits, or null if Redis or the hashing secret isn't configured. */
export const limiter: Limiter | null = redis && RATE_LIMIT_SECRET ? { counter: redis, secret: RATE_LIMIT_SECRET } : null;

/** What's missing when `limiter` is null, for the server log. Names only, never values. */
export const limiterMissing = [
	!redis && 'Redis (REDIS_URL, or KV_REST_API_URL + KV_REST_API_TOKEN)',
	!RATE_LIMIT_SECRET && 'RATE_LIMIT_SECRET'
].filter(Boolean);

/** LiveKit settings for voice conversations, or null if any of the four is missing. */
export const voiceConfig: VoiceConfig | null =
	LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_AGENT_NAME
		? { url: LIVEKIT_URL, apiKey: LIVEKIT_API_KEY, apiSecret: LIVEKIT_API_SECRET, agentName: LIVEKIT_AGENT_NAME }
		: null;
