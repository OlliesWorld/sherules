import type { Client } from '@libsql/client';
import type { GoogleGenAI } from '@google/genai';
import { getSource } from '../ingest/sources.ts';
import { generateAnswer, NOT_FOUND_ANSWER, type GeneratedAnswer } from './answer.ts';
import type { Embedder } from './embed.ts';
import { expandWithGlossary, findGlossaryEntries } from './glossary.ts';
import { rewriteQuery } from './rewrite.ts';
import type { Citation, RulebookAnswer } from '../types.ts';
import { mergeResults, searchChunks, type RetrievedChunk } from './search.ts';

/** The clients the RAG flow needs. Passed in so the app and the evals can each build their own. */
export interface RagDeps {
	db: Client;
	embedder: Embedder;
	genai: GoogleGenAI;
}

// Citation and RulebookAnswer live in lib/types.ts, shared with the pages and the mobile app.
export type { Citation, RulebookAnswer } from '../types.ts';

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

	const notes = glossary.map((entry) => entry.note);
	let generated = await generateAnswer(deps.genai, question, chunks, notes);
	// With a terminology note ("NCAA has no Reset; the closest rule is…") the model still
	// sometimes says "can't find" (about 1 in 4 in testing). Those are the questions where a
	// different word is the whole problem, so one more try is worth it. Rare, so cheap.
	if (!generated.found && notes.length > 0) {
		generated = await generateAnswer(deps.genai, question, chunks, notes);
	}

	const citations = generated.citedRefs.map((ref) => {
		const excerpt = excerpts.find((e) => e.ruleRef === ref)!;
		return { ruleRef: ref, sourceName: excerpt.sourceName, url: excerpt.url, page: excerpt.page, excerpt: excerpt.text };
	});

	return { found: generated.found, answer: generated.answer, citations, excerpts, notes: generated.notes, retrieval };
}
