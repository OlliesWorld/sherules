import { createHash } from 'node:crypto';
import type { Client } from '@libsql/client';

// Free questions per visitor per day. Each question costs two Gemini calls
// (one embedding, one answer), so this caps spending on a public site.
export const ASKS_PER_DAY = 2;

// One row per visitor per day, counting their questions.
let tableReady: Promise<unknown> | undefined;
function ensureTable(db: Client) {
	// ??= runs the CREATE only once per server start.
	tableReady ??= db.execute(`CREATE TABLE IF NOT EXISTS ask_usage (
		visitor TEXT NOT NULL,
		day     TEXT NOT NULL,
		count   INTEGER NOT NULL,
		PRIMARY KEY (visitor, day)
	)`);
	return tableReady;
}

/** Today's date in UTC, e.g. "2026-10-12". The limit resets at midnight UTC. */
function today(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Visitors are identified by IP address, but the IP is never stored: it's hashed
 * together with the date, so the same person can't be linked from one day to the next.
 */
function visitorKey(ip: string, day: string): string {
	return createHash('sha256').update(`${day}:${ip}`).digest('hex');
}

/** How many questions this visitor has left today. */
export async function asksLeft(db: Client, ip: string): Promise<number> {
	await ensureTable(db);
	const day = today();
	const result = await db.execute({
		sql: 'SELECT count FROM ask_usage WHERE visitor = ? AND day = ?',
		args: [visitorKey(ip, day), day]
	});
	const used = result.rows.length > 0 ? Number(result.rows[0].count) : 0;
	return Math.max(0, ASKS_PER_DAY - used);
}

/**
 * Uses up one of today's questions. Returns false if the visitor was already at the limit.
 * Counting happens in one SQL statement, so two quick clicks can't both slip through.
 */
export async function takeAsk(db: Client, ip: string): Promise<boolean> {
	await ensureTable(db);
	const day = today();
	const result = await db.execute({
		sql: `INSERT INTO ask_usage (visitor, day, count) VALUES (?, ?, 1)
			ON CONFLICT (visitor, day) DO UPDATE SET count = count + 1
			RETURNING count`,
		args: [visitorKey(ip, day), day]
	});
	return Number(result.rows[0].count) <= ASKS_PER_DAY;
}

/** Gives a question back, e.g. when Gemini failed and the visitor got no answer. */
export async function refundAsk(db: Client, ip: string): Promise<void> {
	const day = today();
	await db.execute({
		sql: 'UPDATE ask_usage SET count = count - 1 WHERE visitor = ? AND day = ? AND count > 0',
		args: [visitorKey(ip, day), day]
	});
}
