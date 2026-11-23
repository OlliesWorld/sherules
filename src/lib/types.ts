// Types shared by the server, the website's pages and the mobile app (mobile/).
// Type-only imports from lib/server are erased at build time, so nothing server-side
// reaches the browser or the app bundle.
import type { GeneratedAnswer } from './server/answer.ts';
import type { RetrievedChunk } from './server/search.ts';

export interface Citation {
	ruleRef: string;
	sourceName: string;
	/** Official PDF, opened at the chunk's page. */
	url: string;
	page: number;
	/** The cited chunk's rule text, shown under the rule number. */
	excerpt: string;
}

export interface RulebookAnswer {
	found: boolean;
	answer: string;
	citations: Citation[];
	/** Every chunk sent to the model, cited or not, for checking retrieval. */
	excerpts: (RetrievedChunk & { sourceName: string; url: string })[];
	/** For tracing a "not found" (see GeneratedAnswer). Absent when nothing was retrieved. */
	notes?: GeneratedAnswer['notes'];
	/** How the question was searched, for tracing misses: the rewrite (if any) and glossary entries that matched. */
	retrieval: { rewrittenQuery: string | null; glossaryTerms: string[] };
}

/** What asking returned (an `ask` form action, or POST /api/v1/ask). */
export interface AskOutcome {
	question?: string;
	league?: string;
	error?: string;
	limitReached?: boolean;
	atCapacity?: boolean;
	result?: RulebookAnswer;
	asksLeft?: number | null;
	/** Sport page: no league could be worked out, so the visitor picks one of these. */
	chooseFrom?: string[];
	/** Sport page: how other leagues differ on this question (verified glossary notes). */
	elsewhere?: { league: string; note: string }[];
}
