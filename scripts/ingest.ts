// Reads a rulebook PDF, chunks it, embeds each chunk with Gemini and stores it in libSQL.
//
// Usage:
//   npm run ingest -- <source-id>             parse, embed and store
//   npm run ingest -- <source-id> --dry-run   parse and print the summary only (no API calls, no DB)
//
// Source ids are listed in src/lib/ingest/sources.ts.
import { parseNcaaRulebook } from '#lib/ingest/chunk-ncaa-rulebook.ts';
import { parseNcaaSections } from '#lib/ingest/chunk-ncaa-sections.ts';
import { readPdfPages } from '#lib/ingest/pdf.ts';
import { getSource, sources } from '#lib/ingest/sources.ts';
import type { ParsedChunk, ParserName, ParseResult, Source } from '#lib/ingest/types.ts';
import { createDb, ensureSchema, replaceSourceChunks, type ChunkRow } from '#lib/server/db.ts';
import { createEmbedder, documentInput, EMBEDDING_MODEL_TAG } from '#lib/server/embed.ts';

const parsers: Record<ParserName, (pages: string[], source: Source) => ParseResult> = {
	'ncaa-rulebook': parseNcaaRulebook,
	'ncaa-sections': parseNcaaSections
};

async function main() {
	const [sourceId, ...flags] = process.argv.slice(2);
	const dryRun = flags.includes('--dry-run');

	const source = sourceId ? getSource(sourceId) : undefined;
	if (!source) {
		console.error(`Usage: npm run ingest -- <source-id> [--dry-run]`);
		console.error(`Known sources: ${sources.map((s) => s.id).join(', ')}`);
		process.exit(1);
	}

	console.log(`\nReading ${source.file}`);
	const pages = await readPdfPages(source.file);
	console.log(`  ${pages.length} pages`);

	const { chunks, problems } = parsers[source.parser](pages, source);
	checkUniqueRefs(chunks);
	printSummary(source, pages.length, chunks, problems);

	if (dryRun) {
		console.log('\nDry run: nothing embedded or stored.');
		return;
	}

	const apiKey = requireEnv('GEMINI_API_KEY');
	const db = createDb(requireEnv('TURSO_DATABASE_URL'), process.env.TURSO_AUTH_TOKEN || undefined);
	// Set up the table before embedding, so a database problem fails fast instead of after 372 API calls.
	await ensureSchema(db);

	console.log(`\nEmbedding ${chunks.length} chunks with ${EMBEDDING_MODEL_TAG}`);
	const embedder = createEmbedder(apiKey);
	const vectors = await embedder.embedAll(
		chunks.map((chunk) => documentInput(chunk.headingPath, chunk.text)),
		(done, total) => process.stdout.write(`\r  ${done}/${total}`)
	);
	process.stdout.write('\n');

	const rows: ChunkRow[] = chunks.map((chunk, i) => ({
		id: `${source.id}:${slugify(chunk.ruleRef)}`,
		sport: source.sport,
		league: source.league,
		season: source.season,
		sourceId: source.id,
		division: source.division,
		ruleRef: chunk.ruleRef,
		type: chunk.type,
		headingPath: chunk.headingPath,
		text: chunk.text,
		page: chunk.page,
		embeddingModel: EMBEDDING_MODEL_TAG,
		embedding: vectors[i]
	}));

	await replaceSourceChunks(db, source.id, rows);

	const stored = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM chunks WHERE source_id = ?', args: [source.id] });
	console.log(`Stored ${stored.rows[0].n} chunks for ${source.id}\n`);
}

function printSummary(source: Source, pageCount: number, chunks: ParsedChunk[], problems: { page: number; reason: string }[]) {
	const line = '─'.repeat(70);
	console.log(`\n${line}\nSUMMARY: ${source.name}\n${line}`);

	const byType = countBy(chunks, (chunk) => chunk.type);
	console.log(`Chunks: ${chunks.length}  (${Object.entries(byType).map(([type, n]) => `${type}: ${n}`).join(', ')})`);

	// Chunks per rule. A rule with suspiciously few chunks usually means a missed heading.
	console.log('\nChunks per rule (rule / interpretation):');
	const ruleNumber = (chunk: ParsedChunk) => chunk.ruleRef.match(/^Rule (\d+)/)?.[1] ?? '?';
	const titles = new Map(chunks.map((chunk) => [ruleNumber(chunk), chunk.headingPath.split(' > ').find((p) => p.startsWith('Rule '))]));
	const ruleNums = [...new Set(chunks.map(ruleNumber))].sort((a, b) => Number(a) - Number(b));
	for (const num of ruleNums) {
		const rules = chunks.filter((c) => ruleNumber(c) === num && c.type === 'rule').length;
		const interps = chunks.filter((c) => ruleNumber(c) === num && c.type === 'interpretation').length;
		console.log(`  ${String(rules).padStart(3)} / ${String(interps).padEnd(3)} ${titles.get(num)}`);
	}

	const lengths = chunks.map((chunk) => chunk.text.split(/\s+/).length).sort((a, b) => a - b);
	const longest = chunks.reduce((a, b) => (a.text.length > b.text.length ? a : b));
	console.log(`\nWords per chunk: min ${lengths[0]}, median ${lengths[Math.floor(lengths.length / 2)]}, max ${lengths.at(-1)} (${longest.ruleRef})`);

	// A spread of samples: the first chunk, one from the middle, and the first of each special kind.
	const samples = [
		chunks[0],
		chunks[Math.floor(chunks.length / 2)],
		chunks.find((c) => c.ruleRef.includes('Table')),
		chunks.find((c) => c.ruleRef.includes('Penalty')),
		chunks.find((c) => c.type === 'interpretation')
	];
	console.log(`\nSample chunks:`);
	for (const chunk of new Set(samples)) {
		if (!chunk) continue;
		console.log(`\n  [${chunk.ruleRef}]  type=${chunk.type}  page=${chunk.page}`);
		console.log(`  heading: ${chunk.headingPath}`);
		console.log(indent(truncate(chunk.text, 700)));
	}

	console.log(`\nSkipped on purpose:`);
	for (const range of source.skipped) {
		const pages = range.from === range.to ? `${range.from}` : `${range.from}-${range.to}`;
		console.log(`  pages ${pages.padEnd(8)} ${range.reason}`);
	}
	const covered = new Set<number>();
	for (const r of [...source.ranges, ...source.skipped]) for (let p = r.from; p <= r.to; p++) covered.add(p);
	const unaccounted = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => !covered.has(p));
	if (unaccounted.length > 0) console.log(`  WARNING: pages not in any range or skip list: ${unaccounted.join(', ')}`);

	console.log(`\nPages that didn't parse cleanly (${problems.length}):`);
	if (problems.length === 0) console.log('  none');
	for (const problem of problems) console.log(`  page ${String(problem.page).padEnd(4)} ${problem.reason}`);
}

/** Ids are built from rule refs, so two chunks with the same ref would overwrite each other. */
function checkUniqueRefs(chunks: ParsedChunk[]) {
	const seen = new Set<string>();
	for (const chunk of chunks) {
		if (seen.has(chunk.ruleRef)) throw new Error(`Duplicate rule ref "${chunk.ruleRef}" (page ${chunk.page})`);
		seen.add(chunk.ruleRef);
	}
}

/** "Rule 6, Table 1" -> "rule-6-table-1", "Rule 9.2.3" -> "rule-9.2.3" */
function slugify(ruleRef: string): string {
	return ruleRef.toLowerCase().replace(/,/g, '').replace(/\s+/g, '-');
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
		process.exit(1);
	}
	return value;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
	return counts;
}

function truncate(text: string, max: number) {
	return text.length > max ? text.slice(0, max) + ' …' : text;
}

function indent(text: string) {
	return text.split('\n').map((line) => `    ${line}`).join('\n');
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
