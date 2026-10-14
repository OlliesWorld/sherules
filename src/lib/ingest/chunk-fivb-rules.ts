import {
	addChunk as addSharedChunk,
	collectLines,
	isAllCaps,
	joinHyphenatedLines,
	openChunk,
	rulePath,
	titleCase,
	type Line,
	type OpenChunk
} from './pdf-lines.ts';
import type { PageProblem, ParsedChunk, ParseResult, Source } from './types.ts';

// Chunker for rulebooks in the FIVB layout (e.g. USA Volleyball's Indoor Rules):
//   CHAPTER 1 / FACILITIES AND EQUIPMENT   chapter heading (skipped)
//   RULE 1. PLAYING AREA                   rule; text before its first sub-rule is its own chunk
//   1.2 Playing Surface                    sub-rule  <- one chunk per sub-rule
//   1.2.1: The surface must be ...         numbered point inside the sub-rule
//   USAV 1.2.1: a. Players may mop ...     USA Volleyball's change to that point, kept alongside it
//
// One chunk per sub-rule keeps each FIVB rule together with USA Volleyball's changes to it.
// References follow the book's own style: Rule 1.2.
//
// A "definitions" range is a glossary of "TERM: explanation" lines, one chunk per term.

const RULE_HEADING = /^RULE (\d+)\. (.+)$/;
const SUBRULE_HEADING = /^(\d{1,2})\.(\d{1,2}) ([A-Z].*)$/;
const STRUCTURE_LINE = /^(CHAPTER \d+|SECTION [IVX]+)$/;
const DEFINITION = /^([A-Z][A-Z0-9 /’'.-]+): (.*)$/;

// Repeated on every page: "20 | USA VOLLEYBALL • INDOOR RULES 2025-2027" (or with the
// number on the right), and the chapter tabs in the margin, which extract as lone "C" / "1".
const PAGE_HEADER = /^(\d+ \| )?USA VOLLEYBALL • INDOOR RULES [\d-]+( \| \d+)?$/;
const MARGIN_TAB = /^(C|\d{1,2})$/;

// When rejoining wrapped lines, these start a new line: numbered points and USA Volleyball
// changes (both end in a colon: "1.2.1:", "USAV 15:"), lettered items ("a." or "a)"),
// dash and bullet lists, notes. The colon matters: "USAV 12.4.5, 15.11.1.1)" wrapping onto
// a new line is the end of a "(see also ...)" reference, not a new point.
const STARTS_NEW_LINE = /^(USAV [\d.]+[a-z]?:|\d{1,2}\.\d{1,2}\.[\d.]+:|[a-z][.)]\s|–\s|•|Note|NOTE)/;

export function parseFivbRules(pages: string[], source: Source): ParseResult {
	const chunks: ParsedChunk[] = [];
	const problems: PageProblem[] = [];
	const isPageFurniture = (line: string) => PAGE_HEADER.test(line) || MARGIN_TAB.test(line);

	for (const range of source.ranges) {
		const lines = collectLines(pages, range, source, problems, isPageFurniture);
		if (range.layout === 'definitions') {
			parseDefinitions(lines, chunks, problems);
		} else {
			parseRules(lines, chunks, problems);
		}
	}

	return { chunks, problems };
}

function parseRules(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let rule: { num: number; title: string } | null = null;
	let lastSubrule = 0;
	let skippingStructure = false;
	let current: OpenChunk | null = null;

	const finish = () => {
		if (current) addChunk(chunks, current, 'rule');
		current = null;
	};

	for (const line of lines) {
		const raw = fixSplitLetters(line.raw);
		const { page } = line;

		// "CHAPTER 1" / "SECTION III" and the all-caps title lines after them aren't rule text.
		if (STRUCTURE_LINE.test(raw)) {
			skippingStructure = true;
			continue;
		}
		if (skippingStructure && isAllCaps(raw) && !RULE_HEADING.test(raw)) continue;
		skippingStructure = false;

		const ruleMatch = raw.match(RULE_HEADING);
		if (ruleMatch) {
			finish();
			const num = Number(ruleMatch[1]);
			if (rule && num !== rule.num + 1) {
				problems.push({ page, reason: `Rule ${num} follows Rule ${rule.num}, a rule heading may be missing` });
			}
			rule = { num, title: titleCase(ruleMatch[2]) };
			lastSubrule = 0;
			// Text between the rule heading and its first sub-rule becomes the rule's own chunk.
			current = openChunk(`Rule ${num}`, rulePath(rule), page);
			continue;
		}

		if (!rule) {
			problems.push({ page, reason: `Text before the first RULE heading: "${raw.slice(0, 60)}"` });
			continue;
		}

		// Sub-rules run in order with no gaps in this book, so requiring the next number
		// avoids mistaking a measurement at the start of a line ("2.24 m ...") for a heading.
		const subruleMatch = raw.match(SUBRULE_HEADING);
		if (subruleMatch && Number(subruleMatch[1]) === rule.num && Number(subruleMatch[2]) === lastSubrule + 1) {
			finish();
			lastSubrule = Number(subruleMatch[2]);
			const ref = `${rule.num}.${lastSubrule}`;
			const title = subruleMatch[3].replace(/\s*\(diagrams?[^)]*\)/i, '');
			current = openChunk(`Rule ${ref}`, `${rulePath(rule)} > ${ref} ${title}`, page);
			continue;
		}

		if (!current) {
			problems.push({ page, reason: `Text outside any rule: "${raw.slice(0, 60)}"` });
			continue;
		}

		current.lines.push(raw);
	}

	finish();
}

function parseDefinitions(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let current: OpenChunk | null = null;

	const finish = () => {
		if (current) addChunk(chunks, current, 'rule');
		current = null;
	};

	for (const line of lines) {
		const raw = fixSplitLetters(line.raw);
		const { page } = line;

		const definitionMatch = raw.match(DEFINITION);
		if (definitionMatch && isAllCaps(definitionMatch[1])) {
			finish();
			const term = titleCase(definitionMatch[1]);
			current = openChunk(`Definition: ${term}`, `Definitions > ${term}`, page);
			// Keep "TERM: explanation" together so the excerpt names what it defines.
			current.lines.push(raw);
			continue;
		}

		// The page's own "DEFINITIONS" title.
		if (!current && isAllCaps(raw)) continue;

		if (!current) {
			problems.push({ page, reason: `Definitions text before the first term: "${raw.slice(0, 60)}"` });
			continue;
		}

		current.lines.push(raw);
	}

	finish();
}

/**
 * Repairs two extraction quirks in this PDF:
 * - "fi", "fl" and "ffi" letter pairs come out with a space after them: "fi rst", "fl oor",
 *   "off icial". Only those exact splits are rejoined, so "of", "if" and "off" are left alone.
 * - Compound words get a space after the hyphen: "warm- up", "time- out". The gap is closed,
 *   except before "or"/"and"/"to", where it's real ("long- or short-sleeved").
 */
function fixSplitLetters(text: string): string {
	return text
		.replace(/\b([Ff][il]) (?=[a-z])/g, '$1')
		.replace(/ff (?=ic)/g, 'ff')
		.replace(/([a-z])- (?!(?:or|and|to)\b)(?=[a-z])/g, '$1-');
}

/** Rejoins words hyphenated across lines, then hands off to the shared chunk builder. */
function addChunk(chunks: ParsedChunk[], open: OpenChunk, type: ParsedChunk['type']) {
	open.lines = joinHyphenatedLines(open.lines);
	addSharedChunk(chunks, open, type, STARTS_NEW_LINE);
}
