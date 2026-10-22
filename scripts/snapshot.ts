// Regression check for parsers: save every source's parser output, change a parser or a shared
// helper, then compare. Sources you didn't mean to change should come out identical.
//
// Usage:
//   npm run snapshot -- save [source-id...]      record the current output (all sources by default)
//   npm run snapshot -- compare [source-id...]   re-parse and compare with the saved output
//
// No API calls. Snapshots go in data/snapshots/ (gitignored: they contain rulebook text).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parsers } from '#lib/ingest/parsers.ts';
import { readPdfPages } from '#lib/ingest/pdf.ts';
import { sources } from '#lib/ingest/sources.ts';
import type { ParseResult } from '#lib/ingest/types.ts';

const SNAPSHOT_DIR = 'data/snapshots';

const [command, ...ids] = process.argv.slice(2);
if (command !== 'save' && command !== 'compare') {
	console.error('Usage: npm run snapshot -- save|compare [source-id...]');
	process.exit(1);
}

const unknown = ids.filter((id) => !sources.some((source) => source.id === id));
if (unknown.length > 0) {
	console.error(`Unknown source id: ${unknown.join(', ')}`);
	process.exit(1);
}

const selected = sources.filter((source) => ids.length === 0 || ids.includes(source.id));
mkdirSync(SNAPSHOT_DIR, { recursive: true });

let changed = 0;
for (const source of selected) {
	const result = parsers[source.parser](await readPdfPages(source.file), source);
	const json = JSON.stringify(result, null, 1);
	const file = `${SNAPSHOT_DIR}/${source.id}.json`;

	if (command === 'save') {
		writeFileSync(file, json);
		console.log(`saved      ${source.id} (${result.chunks.length} chunks)`);
		continue;
	}

	if (!existsSync(file)) {
		console.log(`no snapshot ${source.id} (run save first)`);
		continue;
	}
	const saved = readFileSync(file, 'utf8');
	if (saved === json) {
		console.log(`identical  ${source.id}`);
	} else {
		changed += 1;
		console.log(`CHANGED    ${source.id}\n           ${describeChange(JSON.parse(saved), result)}`);
	}
}

if (command === 'compare') {
	console.log(changed === 0 ? '\nNo changes.' : `\n${changed} source(s) changed. Check the change was intended.`);
	process.exit(changed === 0 ? 0 : 1);
}

/** A one-line pointer to the first difference, to start looking from. */
function describeChange(before: ParseResult, after: ParseResult): string {
	const counts = `${before.chunks.length} → ${after.chunks.length} chunks`;
	const index = after.chunks.findIndex((chunk, i) => JSON.stringify(chunk) !== JSON.stringify(before.chunks[i]));
	if (index !== -1) {
		const was = before.chunks[index]?.ruleRef ?? '(none)';
		return `${counts}; first difference at chunk ${index + 1}: ${was} → ${after.chunks[index].ruleRef}`;
	}
	if (after.chunks.length < before.chunks.length) {
		return `${counts}; chunks removed from ${before.chunks[after.chunks.length].ruleRef} on`;
	}
	return `${counts}; parse problems changed (${before.problems.length} → ${after.problems.length})`;
}
