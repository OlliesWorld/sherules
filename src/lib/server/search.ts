import type { Client } from '@libsql/client';
import type { ChunkType } from '../ingest/types.ts';
import { EMBEDDING_MODEL_TAG, queryInput, type Embedder } from './embed.ts';

// How many chunks to send to the answer model. Fewer risks missing the right rule;
// more fills the prompt with loosely related rules. Tune it with the evals.
export const TOP_K = 5;

export interface RetrievedChunk {
	id: string;
	sourceId: string;
	season: string;
	ruleRef: string;
	type: ChunkType;
	headingPath: string;
	text: string;
	page: number;
	/** Cosine distance to the question: 0 = same meaning, 1 = unrelated, 2 = opposite. Lower is closer. */
	distance: number;
}

/** Embeds the question and returns the closest chunks for one sport and league. */
export async function searchChunks(
	db: Client,
	embedder: Embedder,
	question: string,
	sport: string,
	league: string,
	limit = TOP_K
): Promise<RetrievedChunk[]> {
	const questionVector = await embedder.embedOne(queryInput(question));

	// Filter first, then rank: only this sport and league, and only vectors from the
	// same embedding model (vectors from different models can't be compared).
	// Every remaining chunk is compared, which is exact and fast at this size.
	const result = await db.execute({
		sql: `SELECT id, source_id, season, rule_ref, type, heading_path, text, page,
				vector_distance_cos(embedding, vector32(?)) AS distance
			FROM chunks
			WHERE sport = ? AND league = ? AND embedding_model = ?
			ORDER BY distance
			LIMIT ?`,
		args: [JSON.stringify(questionVector), sport, league, EMBEDDING_MODEL_TAG, limit]
	});

	return result.rows.map((row) => ({
		id: String(row.id),
		sourceId: String(row.source_id),
		season: String(row.season),
		ruleRef: String(row.rule_ref),
		type: row.type as ChunkType,
		headingPath: String(row.heading_path),
		text: String(row.text),
		page: Number(row.page),
		distance: Number(row.distance)
	}));
}
