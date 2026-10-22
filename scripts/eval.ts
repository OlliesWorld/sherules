// Runs the labeled questions in evals/questions.json through the same flow as the website
// and reports, per league, whether the right rule was found, cited, and answered correctly.
//
// Usage:
//   npm run eval                          all questions
//   npm run eval -- --page hockey/ncaa    one page
//   npm run eval -- --id hk-ncaa-icing    one question
//
// Each question calls Gemini twice (embed the question, write the answer), so a full run
// costs a few cents. Results are also saved to evals/results/ (gitignored) for comparing runs.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import { createDb } from '#lib/server/db.ts';
import { createEmbedder } from '#lib/server/embed.ts';
import { NOT_FOUND_ANSWER } from '#lib/server/answer.ts';
import { askRulebook, type RulebookAnswer } from '#lib/server/rag.ts';

interface EvalCase {
	id: string;
	sport: string;
	league: string;
	/** Groups the report: rule, womens-trap, sevens, stats, trivia, off-topic, trick. */
	kind: string;
	question: string;
	expect: 'answer' | 'not_found';
	/** Any one of these should be retrieved and cited. A trailing * matches every piece of a split rule. */
	expectedRefs?: string[];
	/** Each entry must appear in the answer; '|' separates acceptable wordings. */
	mustInclude?: string[];
}

interface CaseResult {
	id: string;
	page: string;
	kind: string;
	question: string;
	expect: EvalCase['expect'];
	/** Expected rule among the retrieved excerpts (answer cases only). */
	retrieved?: boolean;
	/** Expected rule among the answer's citations (answer cases only). */
	cited?: boolean;
	/** Answer contains every required fact, or declined when it should (not_found cases). */
	correct: boolean;
	passed: boolean;
	problems: string[];
	answer: string;
	retrievedRefs: string[];
	citedRefs: string[];
	notes?: RulebookAnswer['notes'];
}

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(name);
	return i === -1 ? undefined : args[i + 1];
};

const apiKey = process.env.GEMINI_API_KEY;
const dbUrl = process.env.TURSO_DATABASE_URL;
if (!apiKey || !dbUrl) {
	console.error('Set GEMINI_API_KEY and TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN for Turso Cloud).');
	process.exit(1);
}

const { cases } = JSON.parse(readFileSync('evals/questions.json', 'utf8')) as { cases: EvalCase[] };
const selected = cases.filter(
	(c) => (!flag('--page') || `${c.sport}/${c.league}` === flag('--page')) && (!flag('--id') || c.id === flag('--id'))
);
if (selected.length === 0) {
	console.error('No questions match. Check --page (e.g. hockey/ncaa) or --id.');
	process.exit(1);
}

const deps = {
	db: createDb(dbUrl, process.env.TURSO_AUTH_TOKEN || undefined),
	embedder: createEmbedder(apiKey),
	genai: new GoogleGenAI({ apiKey })
};

console.log(`\nRunning ${selected.length} questions\n`);
const results: CaseResult[] = [];
// One at a time, so a full run stays well under the API's rate limits.
for (const evalCase of selected) {
	const result = grade(evalCase, await askRulebook(deps, evalCase));
	results.push(result);
	const mark = result.passed ? 'PASS' : 'FAIL';
	console.log(`${mark}  ${result.page.padEnd(18)} ${result.id}`);
	for (const problem of result.problems) console.log(`        ${problem}`);
}

printSummary(results);
saveResults(results);
process.exit(results.every((r) => r.passed) ? 0 : 1);

function grade(evalCase: EvalCase, response: RulebookAnswer): CaseResult {
	const retrievedRefs = response.excerpts.map((e) => e.ruleRef);
	const citedRefs = response.citations.map((c) => c.ruleRef);
	const problems: string[] = [];
	const base = {
		id: evalCase.id,
		page: `${evalCase.sport}/${evalCase.league}`,
		kind: evalCase.kind,
		question: evalCase.question,
		expect: evalCase.expect,
		answer: response.answer,
		retrievedRefs,
		citedRefs,
		notes: response.notes
	};

	if (evalCase.expect === 'not_found') {
		const declined = !response.found && response.answer === NOT_FOUND_ANSWER;
		if (!declined) problems.push(`should have said "${NOT_FOUND_ANSWER}" but answered: ${response.answer.slice(0, 120)}`);
		return { ...base, correct: declined, passed: declined, problems };
	}

	const expected = evalCase.expectedRefs ?? [];
	const isExpected = (ref: string) => expected.some((e) => refMatches(ref, e));
	const retrieved = retrievedRefs.some(isExpected);
	const cited = citedRefs.some(isExpected);
	if (!retrieved) problems.push(`expected ${expected.join(' or ')} in the top results, got: ${retrievedRefs.join(', ')}`);
	else if (!cited) problems.push(`retrieved the right rule but cited: ${citedRefs.join(', ') || 'nothing'}`);

	const answer = response.answer.toLowerCase();
	const missing = (evalCase.mustInclude ?? []).filter(
		(fact) => !fact.split('|').some((wording) => answer.includes(wording.toLowerCase()))
	);
	if (!response.found) {
		// Why: the model said so itself, or it answered but none of its citations matched a chunk.
		const why = !response.notes?.modelFound
			? 'the model said it was not in the excerpts'
			: `the model answered but its citations matched no excerpt: ${response.notes.droppedRefs.join(', ') || 'none given'}`;
		problems.push(`answered "can't find that" but the rule is in the book (${why})`);
	}
	else if (missing.length > 0) problems.push(`answer is missing: ${missing.join(', ')} — "${response.answer.slice(0, 160)}"`);
	const correct = response.found && missing.length === 0;

	return { ...base, retrieved, cited, correct, passed: retrieved && cited && correct, problems };
}

/** "Rule 94.1" matches "Rule 94.1" and its split pieces ("Rule 94.1 (part 2)"); "Law 15*" matches any ref starting "Law 15". */
function refMatches(actual: string, expected: string): boolean {
	if (expected.endsWith('*')) return actual.startsWith(expected.slice(0, -1));
	return actual === expected || actual.startsWith(`${expected} (`) || actual.startsWith(`${expected}(`);
}

function printSummary(all: CaseResult[]) {
	const pct = (n: number, d: number) => (d === 0 ? '   –' : `${Math.round((n / d) * 100)}%`.padStart(4));
	const line = '─'.repeat(78);
	console.log(`\n${line}\n${'Page'.padEnd(20)}${'Retrieved'.padStart(11)}${'Cited'.padStart(9)}${'Correct'.padStart(10)}${'Declines'.padStart(11)}${'Passed'.padStart(10)}\n${line}`);

	const row = (label: string, rows: CaseResult[]) => {
		const answers = rows.filter((r) => r.expect === 'answer');
		const declines = rows.filter((r) => r.expect === 'not_found');
		console.log(
			label.padEnd(20) +
				pct(answers.filter((r) => r.retrieved).length, answers.length).padStart(11) +
				pct(answers.filter((r) => r.cited).length, answers.length).padStart(9) +
				pct(answers.filter((r) => r.correct).length, answers.length).padStart(10) +
				pct(declines.filter((r) => r.correct).length, declines.length).padStart(11) +
				`${rows.filter((r) => r.passed).length}/${rows.length}`.padStart(10)
		);
	};

	for (const page of [...new Set(all.map((r) => r.page))]) row(page, all.filter((r) => r.page === page));
	console.log(line);
	for (const kind of [...new Set(all.map((r) => r.kind))]) row(`  ${kind}`, all.filter((r) => r.kind === kind));
	console.log(line);
	row('All', all);
	console.log(`\nRetrieved: the expected rule was in the top 5 excerpts. Cited: the answer cited it.`);
	console.log(`Correct: the answer states the required facts. Declines: said "can't find that" when it should.\n`);
}

function saveResults(all: CaseResult[]) {
	mkdirSync('evals/results', { recursive: true });
	const file = `evals/results/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
	writeFileSync(file, JSON.stringify({ ranAt: new Date().toISOString(), results: all }, null, 2));
	console.log(`Saved ${file}\n`);
}
