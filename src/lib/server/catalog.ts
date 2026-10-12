import type { Client } from '@libsql/client';
import { getSource } from '../ingest/sources.ts';

// What the site has data for. Pages read from the chunks table itself, so a sport or
// league appears only once something has been ingested for it.

export async function listSports(db: Client): Promise<string[]> {
	const result = await db.execute('SELECT DISTINCT sport FROM chunks ORDER BY sport');
	return result.rows.map((row) => String(row.sport));
}

/** Leagues with data for a sport, each with its newest season. */
export async function listLeagues(db: Client, sport: string): Promise<{ league: string; season: string }[]> {
	const result = await db.execute({
		sql: 'SELECT league, MAX(season) AS season FROM chunks WHERE sport = ? GROUP BY league ORDER BY league',
		args: [sport]
	});
	return result.rows.map((row) => ({ league: String(row.league), season: String(row.season) }));
}

export interface LeagueSource {
	id: string;
	name: string;
	url: string;
	season: string;
}

/** The documents ingested for one sport and league, newest season first. Empty if none. */
export async function listLeagueSources(db: Client, sport: string, league: string): Promise<LeagueSource[]> {
	const result = await db.execute({
		sql: `SELECT DISTINCT source_id, season FROM chunks
			WHERE sport = ? AND league = ?
			ORDER BY season DESC, source_id`,
		args: [sport, league]
	});
	return result.rows.map((row) => {
		const id = String(row.source_id);
		const source = getSource(id);
		return { id, name: source?.name ?? id, url: source?.url ?? '', season: String(row.season) };
	});
}
