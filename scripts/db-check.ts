// Checks the database connection one step at a time and prints the server's actual error.
// Usage: npm run db:check   (uses TURSO_DATABASE_URL and TURSO_AUTH_TOKEN)
import { createDb } from '#lib/server/db.ts';

const url = process.env.TURSO_DATABASE_URL ?? '';
const token = process.env.TURSO_AUTH_TOKEN ?? '';

console.log(`URL:   ${url || '(not set)'}`);
console.log(`Token: ${token ? `set, ${token.length} characters` : '(not set)'}`);

if (!url) process.exit(1);

// Step 1: call Turso's HTTP API directly. The libsql client hides plain-text error
// messages behind "HTTP status 400"; a raw request shows them.
if (!url.startsWith('file:')) {
	const httpUrl = url.replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
	console.log(`\n1. Raw request to ${httpUrl}/v2/pipeline`);
	const response = await fetch(`${httpUrl}/v2/pipeline`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql: 'SELECT 1' } }, { type: 'close' }] })
	});
	console.log(`   HTTP ${response.status}`);
	console.log(`   ${(await response.text()).slice(0, 500)}`);
	if (!response.ok) process.exit(1);
}

// Step 2: the same features the ingest script uses, through the real client.
const db = createDb(url, token || undefined);
const steps: [string, string][] = [
	['SELECT 1', 'SELECT 1'],
	['create a vector table', 'CREATE TABLE IF NOT EXISTS _db_check (v F32_BLOB(3))'],
	['insert a vector', `INSERT INTO _db_check VALUES (vector32('[1, 2, 3]'))`],
	['cosine distance', `SELECT vector_distance_cos(v, vector32('[1, 2, 3]')) AS d FROM _db_check`],
	['clean up', 'DROP TABLE _db_check']
];

console.log('\n2. Client checks');
for (const [label, sql] of steps) {
	try {
		await db.execute(sql);
		console.log(`   ok    ${label}`);
	} catch (error) {
		console.log(`   FAIL  ${label}: ${(error as Error).message}`);
		process.exit(1);
	}
}
console.log('\nDatabase is ready for ingest.');
