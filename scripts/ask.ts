// Asks a question from the terminal, using the same flow as the website.
// Usage: npm run ask -- volleyball ncaa "How many substitutions per set?"
import { GoogleGenAI } from '@google/genai';
import { createDb } from '#lib/server/db.ts';
import { createEmbedder } from '#lib/server/embed.ts';
import { askRulebook } from '#lib/server/rag.ts';

const [sport, league, question] = process.argv.slice(2);
if (!sport || !league || !question) {
	console.error('Usage: npm run ask -- <sport> <league> "<question>"');
	process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
const dbUrl = process.env.TURSO_DATABASE_URL;
if (!apiKey || !dbUrl) {
	console.error('Set GEMINI_API_KEY and TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN for Turso Cloud).');
	process.exit(1);
}

const result = await askRulebook(
	{
		db: createDb(dbUrl, process.env.TURSO_AUTH_TOKEN || undefined),
		embedder: createEmbedder(apiKey),
		genai: new GoogleGenAI({ apiKey })
	},
	{ question, sport, league }
);

console.log(`\nQ: ${question}\n`);
console.log(`A: ${result.answer}\n`);
for (const citation of result.citations) {
	console.log(`   cited: ${citation.ruleRef}  ${citation.url}`);
}

// Retrieval view: what came back and how close it was. Lower distance = closer match.
console.log('\nRetrieved (closest first):');
for (const excerpt of result.excerpts) {
	const cited = result.citations.some((c) => c.ruleRef === excerpt.ruleRef) ? 'cited' : '     ';
	console.log(`  ${excerpt.distance.toFixed(3)}  ${cited}  ${excerpt.ruleRef.padEnd(24)} ${excerpt.headingPath.split(' > ').at(-1)}`);
}
console.log();
