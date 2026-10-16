import { createHash, timingSafeEqual } from 'node:crypto';
import { getSource } from '../ingest/sources.ts';
import type { RetrievedChunk } from './search.ts';

// Retrieval-only search for the LiveKit voice agent (GET /api/rules/search).
// The agent's own LLM writes the spoken answer, so there is no LLM call here, only the
// question embedding and the vector search. Kept separate from the route so it can be
// tested without SvelteKit, Turso or Gemini.

export const MAX_QUERY_LENGTH = 300;
export const MAX_RESULTS = 3;
export const PASSAGE_LENGTH = 800;

export interface AgentSearchResult {
	/** As the rulebook cites it: "Rule 11.3.2", "Rule 13, Situation 1". */
	ruleNumber: string;
	/** Last part of the heading path: "11.3.2 Limitations". */
	title: string;
	/** Rule text, trimmed to about PASSAGE_LENGTH characters at a word boundary. */
	passage: string;
	/** "rule", or "interpretation" for official rulings on example situations. */
	type: RetrievedChunk['type'];
	/** Rulebook name, so the agent can say where the rule comes from. */
	source: string;
}

export type AgentSearchBody = { results: AgentSearchResult[] } | { error: string };

export interface AgentSearchInput {
	/** The request's x-sherules-key header (null if missing). */
	providedKey: string | null;
	/** SHERULES_AGENT_KEY from the environment (undefined if not set). */
	expectedKey: string | undefined;
	/** The q query parameter (null if missing). */
	query: string | null;
	/** Runs the vector search; returns the closest chunks, closest first. */
	search: (query: string, limit: number) => Promise<RetrievedChunk[]>;
}

/** Checks the key, validates q, searches, and shapes the response. Never throws. */
export async function handleAgentSearch(input: AgentSearchInput): Promise<{ status: number; body: AgentSearchBody }> {
	if (!keyMatches(input.providedKey, input.expectedKey)) {
		return { status: 401, body: { error: 'Unauthorized' } };
	}

	const query = input.query?.trim() ?? '';
	if (query === '') {
		return { status: 400, body: { error: 'Missing query parameter q' } };
	}
	if (query.length > MAX_QUERY_LENGTH) {
		return { status: 400, body: { error: `q must be ${MAX_QUERY_LENGTH} characters or fewer` } };
	}

	try {
		const chunks = await input.search(query, MAX_RESULTS);
		return { status: 200, body: { results: chunks.slice(0, MAX_RESULTS).map(toResult) } };
	} catch (err) {
		// Details stay in the server log; the caller gets a short message only.
		console.error('[sherules] Agent search failed:', err);
		return { status: 500, body: { error: 'Search failed' } };
	}
}

/**
 * Compares keys in constant time, so response timing doesn't reveal how much of a
 * guessed key was right. Hashing first gives both sides the same length, which
 * timingSafeEqual requires. If no key is configured, every request is rejected.
 */
function keyMatches(provided: string | null, expected: string | undefined): boolean {
	if (!expected || !provided) return false;
	const hash = (value: string) => createHash('sha256').update(value).digest();
	return timingSafeEqual(hash(provided), hash(expected));
}

function toResult(chunk: RetrievedChunk): AgentSearchResult {
	return {
		ruleNumber: chunk.ruleRef,
		title: chunk.headingPath.split(' > ').at(-1) ?? chunk.ruleRef,
		passage: trimPassage(chunk.text),
		type: chunk.type,
		source: getSource(chunk.sourceId)?.name ?? chunk.sourceId
	};
}

/** Cuts text to about `max` characters, at the last word break, and marks the cut with "…". */
export function trimPassage(text: string, max = PASSAGE_LENGTH): string {
	if (text.length <= max) return text;
	const cut = text.slice(0, max);
	const lastBreak = cut.search(/\s\S*$/);
	return `${(lastBreak > 0 ? cut.slice(0, lastBreak) : cut).trimEnd()}…`;
}
