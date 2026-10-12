import { createClient, type Client } from '@libsql/client';
import type { ChunkType, Division } from '../ingest/types.ts';
// Changing the dimensions means dropping the table and re-ingesting: the column size is fixed.
import { EMBEDDING_DIMENSIONS } from './embed.ts';

/**
 * Connects to libSQL. Locally that's a file (url "file:local.db");
 * in production it's Turso Cloud (url "libsql://...", plus an auth token).
 * Takes the values as arguments so both the ingest script (process.env)
 * and SvelteKit (its env module) can use it.
 */
export function createDb(url: string, authToken?: string): Client {
	return createClient({ url, authToken });
}

export async function ensureSchema(db: Client): Promise<void> {
	// F32_BLOB(768) is libSQL's vector column type: 768 32-bit floats.
	// No vector index for now. Searches filter by sport/league first, then compare every
	// remaining chunk, which is exact and fast at a few thousand rows.
	await db.batch(
		[
			`CREATE TABLE IF NOT EXISTS chunks (
				id              TEXT PRIMARY KEY,
				sport           TEXT NOT NULL,
				league          TEXT NOT NULL,
				season          TEXT NOT NULL,
				source_id       TEXT NOT NULL,
				division        TEXT NOT NULL,
				rule_ref        TEXT NOT NULL,
				type            TEXT NOT NULL,
				heading_path    TEXT NOT NULL,
				text            TEXT NOT NULL,
				page            INTEGER NOT NULL,
				embedding_model TEXT NOT NULL,
				embedding       F32_BLOB(${EMBEDDING_DIMENSIONS}) NOT NULL
			)`,
			`CREATE INDEX IF NOT EXISTS chunks_sport_league ON chunks (sport, league)`,
			`CREATE INDEX IF NOT EXISTS chunks_source ON chunks (source_id)`
		],
		'write'
	);
}

export interface ChunkRow {
	id: string;
	sport: string;
	league: string;
	season: string;
	sourceId: string;
	division: Division;
	ruleRef: string;
	type: ChunkType;
	headingPath: string;
	text: string;
	page: number;
	embeddingModel: string;
	embedding: number[];
}

/**
 * Replaces every chunk from one source in a single transaction.
 * Re-running ingestion never leaves duplicates or a half-written source.
 */
export async function replaceSourceChunks(db: Client, sourceId: string, rows: ChunkRow[]): Promise<void> {
	const deleteOld = { sql: 'DELETE FROM chunks WHERE source_id = ?', args: [sourceId] };

	const inserts = rows.map((row) => ({
		// vector32() converts a JSON array string like "[0.1, 0.2, ...]" into the F32_BLOB format.
		sql: `INSERT INTO chunks
			(id, sport, league, season, source_id, division, rule_ref, type, heading_path, text, page, embedding_model, embedding)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, vector32(?))`,
		args: [
			row.id,
			row.sport,
			row.league,
			row.season,
			row.sourceId,
			row.division,
			row.ruleRef,
			row.type,
			row.headingPath,
			row.text,
			row.page,
			row.embeddingModel,
			JSON.stringify(row.embedding)
		]
	}));

	await db.batch([deleteOld, ...inserts], 'write');
}
