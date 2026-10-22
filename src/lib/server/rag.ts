import type { Client } from '@libsql/client';
import type { GoogleGenAI } from '@google/genai';
import { getSource } from '../ingest/sources.ts';
import { generateAnswer, NOT_FOUND_ANSWER, type GeneratedAnswer } from './answer.ts';
import type { Embedder } from './embed.ts';
import { searchChunks, type RetrievedChunk } from './search.ts';

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
}

/** The whole flow: retrieve the closest chunks, then answer from them. */
export async function askRulebook(
	deps: RagDeps,
	{ question, sport, league }: { question: string; sport: string; league: string }
): Promise<RulebookAnswer> {
	const chunks = await searchChunks(deps.db, deps.embedder, question, sport, league);

	const excerpts = chunks.map((chunk) => {
		const source = getSource(chunk.sourceId);
		return {
			...chunk,
			sourceName: source?.name ?? chunk.sourceId,
			url: source ? `${source.url}#page=${chunk.page}` : ''
		};
	});

	if (excerpts.length === 0) {
		return { found: false, answer: NOT_FOUND_ANSWER, citations: [], excerpts };
	}

	const generated = await generateAnswer(deps.genai, question, chunks);

	const citations = generated.citedRefs.map((ref) => {
		const excerpt = excerpts.find((e) => e.ruleRef === ref)!;
		return { ruleRef: ref, sourceName: excerpt.sourceName, url: excerpt.url, page: excerpt.page, excerpt: excerpt.text };
	});

	return { found: generated.found, answer: generated.answer, citations, excerpts, notes: generated.notes };
}
