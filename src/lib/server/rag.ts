import type { Client } from '@libsql/client';
import type { GoogleGenAI } from '@google/genai';
import { getSource } from '../ingest/sources.ts';
import { generateAnswer, NOT_FOUND_ANSWER, type GeneratedAnswer } from './answer.ts';
import type { Embedder } from './embed.ts';
import { expandWithGlossary, findGlossaryEntries } from './glossary.ts';
import { rewriteQuery } from './rewrite.ts';
import { mergeResults, searchChunks, type RetrievedChunk } from './search.ts';

/** The clients the RAG flow needs. Passed in so the app and the evals can each build their own. */
export interface RagDeps {
	db: Client;
	embedder: Embedder;
	genai: GoogleGenAI;
}

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

/**
 * The whole flow: search with the question as asked and with a rewrite in rulebook
 * language (plus any glossary terms), merge the closest chunks, then answer from them.
 */
export async function askRulebook(
	deps: RagDeps,
	{ question, sport, league }: { question: string; sport: string; league: string }
): Promise<RulebookAnswer> {
	const glossary = findGlossaryEntries(question, sport, league);

	// The original search doesn't wait for the rewrite, so the rewrite only adds its own
	// model call plus one embedding to the total time.
	const searchRewrite = async () => {
		const rewrite = await rewriteQuery(deps.genai, { question, sport, league, glossary });
		const query = expandWithGlossary(rewrite ?? question, glossary);
		const chunks = query === question ? [] : await searchChunks(deps.db, deps.embedder, query, sport, league);
		return { rewrite, chunks };
	};
	const [asAsked, rewritten] = await Promise.all([
		searchChunks(deps.db, deps.embedder, question, sport, league),
		searchRewrite()
	]);
	const chunks = mergeResults([asAsked, rewritten.chunks]);
	const retrieval = { rewrittenQuery: rewritten.rewrite, glossaryTerms: glossary.flatMap((entry) => entry.rulebookTerms) };

	const excerpts = chunks.map((chunk) => {
		const source = getSource(chunk.sourceId);
		return {
			...chunk,
			sourceName: source?.name ?? chunk.sourceId,
			url: source ? `${source.url}#page=${chunk.page}` : ''
		};
	});

	if (excerpts.length === 0) {
		return { found: false, answer: NOT_FOUND_ANSWER, citations: [], excerpts, retrieval };
	}

	const generated = await generateAnswer(
		deps.genai,
		question,
		chunks,
		glossary.map((entry) => entry.note)
	);

	const citations = generated.citedRefs.map((ref) => {
		const excerpt = excerpts.find((e) => e.ruleRef === ref)!;
		return { ruleRef: ref, sourceName: excerpt.sourceName, url: excerpt.url, page: excerpt.page, excerpt: excerpt.text };
	});

	return { found: generated.found, answer: generated.answer, citations, excerpts, notes: generated.notes, retrieval };
}
