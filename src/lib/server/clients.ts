import { GEMINI_API_KEY, TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } from '$app/env/private';
import { GoogleGenAI } from '@google/genai';
import { createDb } from './db.ts';
import { createEmbedder } from './embed.ts';
import type { RagDeps } from './rag.ts';

// One shared set of clients for the whole app, created when the server starts.
// Only SvelteKit code imports this file. Scripts and evals build their own RagDeps
// from process.env, because '$app/env/private' only exists inside SvelteKit.
export const db = createDb(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN);

export const ragDeps: RagDeps = {
	db,
	embedder: createEmbedder(GEMINI_API_KEY),
	genai: new GoogleGenAI({ apiKey: GEMINI_API_KEY })
};
