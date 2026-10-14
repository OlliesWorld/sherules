import {
	addChunk as addSharedChunk,
	collectLines,
	isAllCaps,
	joinHyphenatedLines,
	openChunk,
	type Line,
	type OpenChunk
} from './pdf-lines.ts';
import type { PageProblem, ParsedChunk, ParseResult, Source } from './types.ts';

// Chunker for USA Volleyball's Casebook of Approved Rulings. Each page is a three-column
// table that extracts in reading order:
//   Rule 2: Nets and Posts                     rule heading
//   Height of the Net; Structure; ...          topic list (skipped)
//   2.01 The net is 9 m (30’) in length.       case number + situation  <- one chunk per case
//   Ruling: If another net ...                 the official ruling
//   Reference: 2.2                             rule(s) the ruling is based on
//
// Case numbers have gaps (retired cases), so a new case just needs a higher number
// within the current rule.

const RULE_HEADING = /^Rule (\d+): (.+)$/;
const CASE_START = /^(\d{1,2})\.(\d{2})([a-z]?) (\S.*)$/;
// "SECTION I – THE GAME", "Chapter One: Facilities and Equipment"
const STRUCTURE_LINE = /^(SECTION [IVX]+ –|Chapter [A-Z][a-z]+:)/;
// Subheadings that group some cases within a rule. They go into those cases' heading path.
const SUBHEADING = /^(Team Rosters, Coaches, and Team Captains|at the USAV Open National Championships \(ONC\)|Libero Service)$/;

// Repeated on every page: "USA Volleyball Indoor Rules Casebook" and "2 Revised 01/01/26".
const PAGE_HEADER = /^(USA Volleyball Indoor Rules Casebook|([ivx]+|\d+) Revised \d\d\/\d\d\/\d\d)$/;

const STARTS_NEW_LINE = /^(Ruling:|Reference:)/;

export function parseUsavCasebook(pages: string[], source: Source): ParseResult {
	const chunks: ParsedChunk[] = [];
	const problems: PageProblem[] = [];

	for (const range of source.ranges) {
		const lines = collectLines(pages, range, source, problems, (line) => PAGE_HEADER.test(line));
		parseCases(lines, chunks, problems);
	}

	return { chunks, problems };
}

function parseCases(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let rule: { num: number; title: string } | null = null;
	let subheading = '';
	let lastCase = 0;
	let readingTopics = false;
	let skippingStructure = false;
	let current: OpenChunk | null = null;

	const finish = () => {
		if (current) addChunk(chunks, current);
		current = null;
	};

	const headingPath = () => {
		if (!rule) return '';
		const base = `USA Volleyball Casebook > Rule ${rule.num} – ${rule.title}`;
		return subheading ? `${base} > ${subheading}` : base;
	};

	for (const { raw, page } of lines) {
		// Section and chapter headings (a section title can wrap onto an all-caps second line).
		if (STRUCTURE_LINE.test(raw)) {
			skippingStructure = true;
			continue;
		}
		if (skippingStructure && isAllCaps(raw)) continue;
		skippingStructure = false;

		const ruleMatch = raw.match(RULE_HEADING);
		if (ruleMatch) {
			finish();
			rule = { num: Number(ruleMatch[1]), title: ruleMatch[2] };
			subheading = '';
			lastCase = 0;
			readingTopics = true;
			continue;
		}

		if (SUBHEADING.test(raw)) {
			finish();
			subheading = subheading ? `${subheading} ${raw}` : raw;
			continue;
		}

		const caseMatch = raw.match(CASE_START);
		const caseNum = caseMatch ? Number(caseMatch[2]) : 0;
		if (caseMatch && rule && Number(caseMatch[1]) === rule.num && caseNum > lastCase) {
			finish();
			readingTopics = false;
			lastCase = caseNum;
			const ref = `${rule.num}.${caseMatch[2]}${caseMatch[3]}`;
			current = openChunk(`Case ${ref}`, headingPath(), page);
			current.lines.push(raw);
			continue;
		}

		// The topic list under a rule heading, before its first case.
		if (readingTopics) continue;

		if (!current) {
			problems.push({ page, reason: `Casebook text outside any case: "${raw.slice(0, 60)}"` });
			continue;
		}

		current.lines.push(raw);
	}

	finish();
}

/** Rejoins words hyphenated across lines, then hands off to the shared chunk builder. */
function addChunk(chunks: ParsedChunk[], open: OpenChunk) {
	open.lines = joinReferences(joinHyphenatedLines(open.lines));
	addSharedChunk(chunks, open, 'interpretation', STARTS_NEW_LINE);
}

// A rule number in a reference list: "12.4.3", "USAV 8.4.2a", "USAV 15".
const RULE_NUMBER = /^(USAV )?\d+(\.\d+)*[a-z]?$/;

/**
 * The Reference column lists one rule per line ("12.3", "12.4.3", "1.4.2"). Join rule
 * numbers with commas so they don't run together; anything else (e.g. "Instructions for /
 * Use of the / Score Sheets") wraps as normal text.
 */
function joinReferences(lines: string[]): string[] {
	const start = lines.findIndex((line) => line.startsWith('Reference:'));
	if (start === -1) return lines;

	let references = lines[start].replace(/^Reference:\s*/, '');
	for (const line of lines.slice(start + 1)) {
		// "USAV" alone on a line belongs to the number on the next line ("USAV 26.2.2.1").
		const separator = references === '' ? '' : RULE_NUMBER.test(line) && !references.endsWith('USAV') ? ', ' : ' ';
		references += separator + line;
	}
	return [...lines.slice(0, start), `Reference: ${references}`];
}
