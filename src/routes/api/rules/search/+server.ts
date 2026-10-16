import { json } from '@sveltejs/kit';
import { SHERULES_AGENT_KEY } from '$app/env/private';
import { handleAgentSearch } from '#lib/server/agent-search.ts';
import { db, ragDeps } from '#lib/server/clients.ts';
import { searchChunks } from '#lib/server/search.ts';
import type { RequestHandler } from './$types';

// GET /api/rules/search?q=...  (header: x-sherules-key)
// Retrieval-only rules search for the LiveKit voice agent: returns up to 3 rulebook
// passages and no generated answer. NCAA women's volleyball only for now.
// A +server.ts file is an API route, like a Next.js route handler.
export const GET: RequestHandler = async ({ request, url }) => {
	const { status, body } = await handleAgentSearch({
		providedKey: request.headers.get('x-sherules-key'),
		expectedKey: SHERULES_AGENT_KEY,
		query: url.searchParams.get('q'),
		search: (query, limit) => searchChunks(db, ragDeps.embedder, query, 'volleyball', 'ncaa', limit)
	});

	// Results depend on the key and query, so never cache them.
	return json(body, { status, headers: { 'cache-control': 'no-store' } });
};
