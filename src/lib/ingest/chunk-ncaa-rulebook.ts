import type { PageProblem, PageRange, ParsedChunk, ParseResult, Source } from './types.ts';

// Chunker for NCAA rulebooks laid out as:
//   RULE 1                     rule
//   Facilities and Equipment   rule title (one or two lines)
//   1.2 THE COURT              section (title in caps)
//   1.2.2 Court Markings       article  <- one chunk per article
//   1�2�2�1 ...                numbered text inside the article
//
// The PDF's body font has no period glyph, so the text extractor returns "�" (U+FFFD)
// wherever a period should be. Headings use a different font with a real period.
// That is what tells "1.2.2 Court Markings" (a heading) apart from "1�2�2�1 ..." (text).
// Patterns run on the raw line, and "�" is turned back into "." only after that.

const RULE_HEADING = /^RULE (\d+)$/;
const SECTION_HEADING = /^(\d+)\.(\d+) (.+)$/;
const ARTICLE_HEADING = /^(\d+)\.(\d+)\.(\d+) (.+)$/;
const TABLE_START = /^Table (\d+)(?::\s*(.+))?$/; // "Table 1" or "Table 2: Prematch Protocol"
const SUB_ITEM = /^\d+�\d+�\d+�\d+/; // "9�1�1�1 In a tournament..."
const SITUATION_START = /^SITUATION (\d+):/;

// "14 RULE 1 / FACILITIES AND EqUIPMENT" or "RULE 1 / FACILITIES AND EqUIPMENT 15"
const RUNNING_HEADER = /^(\d+ )?RULE \d+ \//;
const PAGE_NUMBER = /^\d{1,3}$/;
// Dotted leaders before a page number, as in a table of contents or index.
const LEADER_LINE = /(�{4,}|\.{4,})\s*\d+$/;

// When rejoining wrapped lines, these start a new line instead of continuing the previous one.
const STARTS_NEW_LINE = /^(\d+(\.\d+){3,}\s|[a-z]\.\s|•|Note:|NOTE:)/;

interface Line {
	raw: string;
	page: number;
}

/** A chunk while it is being filled, line by line. */
interface OpenChunk {
	ruleRef: string;
	headingPath: string;
	page: number;
	lines: string[];
	isTable: boolean;
}

export function parseNcaaRulebook(pages: string[], source: Source): ParseResult {
	const chunks: ParsedChunk[] = [];
	const problems: PageProblem[] = [];

	for (const range of source.ranges) {
		const lines = collectLines(pages, range, source, problems);
		if (range.type === 'interpretation') {
			parseInterpretations(lines, chunks, problems);
		} else {
			parseRules(lines, chunks, problems);
		}
	}

	return { chunks, problems };
}

/** Turns the pages in a range into a flat list of lines, dropping page furniture. */
function collectLines(
	pages: string[],
	range: PageRange,
	source: Source,
	problems: PageProblem[]
): Line[] {
	const lines: Line[] = [];

	for (let page = range.from; page <= range.to; page++) {
		const skipReason = source.skipPages?.[page];
		if (skipReason) {
			problems.push({ page, reason: `Skipped: ${skipReason}` });
			continue;
		}

		const pageLines = (pages[page - 1] ?? '')
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line !== '');

		if (pageLines.length === 0) {
			problems.push({ page, reason: 'No text extracted (blank or image-only page)' });
			continue;
		}

		const leaderCount = pageLines.filter((line) => LEADER_LINE.test(line)).length;
		if (leaderCount >= 3) {
			problems.push({ page, reason: 'Looks like a table of contents or index, skipped' });
			continue;
		}

		// The printed page number sits alone on the first line of some pages.
		if (PAGE_NUMBER.test(pageLines[0])) pageLines.shift();

		for (const raw of pageLines) {
			if (RUNNING_HEADER.test(raw)) continue;
			lines.push({ raw, page });
		}
	}

	return lines;
}

function parseRules(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let rule: { num: number; title: string } | null = null;
	let section: { num: number; title: string } | null = null;
	let lastArticleNum = 0;
	let readingRuleTitle = false;
	let readingTableTitle = false;

	let current: OpenChunk | null = null;
	// An article interrupted by a table. Its numbered text may continue after the table.
	let paused: OpenChunk | null = null;

	const finishAll = () => {
		if (current) addChunk(chunks, current, 'rule');
		if (paused) addChunk(chunks, paused, 'rule');
		current = null;
		paused = null;
	};

	for (const { raw, page } of lines) {
		const ruleMatch = raw.match(RULE_HEADING);
		if (ruleMatch) {
			finishAll();
			const num = Number(ruleMatch[1]);
			if (rule && num !== rule.num + 1) {
				problems.push({ page, reason: `Rule ${num} follows Rule ${rule.num}, a rule heading may be missing` });
			}
			rule = { num, title: '' };
			section = null;
			readingRuleTitle = true;
			continue;
		}

		if (!rule) {
			problems.push({ page, reason: `Text before the first RULE heading: "${clean(raw).slice(0, 60)}"` });
			continue;
		}

		const sectionMatch = raw.match(SECTION_HEADING);
		if (sectionMatch && Number(sectionMatch[1]) === rule.num && isAllCaps(sectionMatch[3])) {
			finishAll();
			const num = Number(sectionMatch[2]);
			const expected: number = section ? section.num + 1 : 1;
			if (num !== expected) {
				problems.push({ page, reason: `Section ${rule.num}.${num} found, expected ${rule.num}.${expected}` });
			}
			section = { num, title: clean(sectionMatch[3]) };
			lastArticleNum = 0;
			readingRuleTitle = false;
			// Text between a section heading and its first article becomes its own chunk.
			current = openChunk(`Rule ${rule.num}.${num}`, rulePath(rule) + ` > ${rule.num}.${num} ${section.title}`, page);
			continue;
		}

		const articleMatch = raw.match(ARTICLE_HEADING);
		if (articleMatch && section && Number(articleMatch[1]) === rule.num && Number(articleMatch[2]) === section.num) {
			finishAll();
			const num = Number(articleMatch[3]);
			if (num !== lastArticleNum + 1) {
				problems.push({ page, reason: `Article ${rule.num}.${section.num}.${num} found, expected ${rule.num}.${section.num}.${lastArticleNum + 1}` });
			}
			lastArticleNum = num;
			const ref = `${rule.num}.${section.num}.${num}`;
			const path = rulePath(rule) + ` > ${rule.num}.${section.num} ${section.title} > ${ref} ${clean(articleMatch[4])}`;
			current = openChunk(`Rule ${ref}`, path, page);
			continue;
		}

		const tableMatch = raw.match(TABLE_START);
		if (tableMatch) {
			// Keep the article open so its text can resume after the table.
			if (current && !current.isTable) {
				if (paused) addChunk(chunks, paused, 'rule');
				paused = current;
			} else if (current) {
				addChunk(chunks, current, 'rule');
			}
			const title = tableMatch[2] ? clean(tableMatch[2]) : '';
			current = openChunk(`Rule ${rule.num}, Table ${tableMatch[1]}`, rulePath(rule) + ` > Table ${tableMatch[1]}`, page);
			current.isTable = true;
			if (title) current.headingPath += ` ${title}`;
			readingTableTitle = !title;
			problems.push({ page, reason: `Table ${tableMatch[1]} flattened to plain text, check that rows read correctly` });
			continue;
		}

		if (readingTableTitle && current) {
			current.headingPath += ` ${clean(raw)}`;
			readingTableTitle = false;
			continue;
		}

		// Numbered article text right after a table means the table has ended.
		if (current?.isTable && paused && SUB_ITEM.test(raw)) {
			addChunk(chunks, current, 'rule');
			current = paused;
			paused = null;
		}

		// A rule-level note (e.g. under Rule 19) ends the title and starts the rule's own chunk.
		if (readingRuleTitle && /^Note:/i.test(raw)) {
			readingRuleTitle = false;
			current = openChunk(`Rule ${rule.num}`, rulePath(rule), page);
		}

		if (readingRuleTitle) {
			rule.title = rule.title ? `${rule.title} ${clean(raw)}` : clean(raw);
			continue;
		}

		if (!current) {
			problems.push({ page, reason: `Text outside any section in Rule ${rule.num}: "${clean(raw).slice(0, 60)}"` });
			continue;
		}

		current.lines.push(clean(raw));
	}

	finishAll();
}

function parseInterpretations(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let rule: { num: number; title: string } | null = null;
	let lastSituationNum = 0;
	let readingRuleTitle = false;
	let current: OpenChunk | null = null;

	const finish = () => {
		if (current) addChunk(chunks, current, 'interpretation');
		current = null;
	};

	for (const { raw, page } of lines) {
		const ruleMatch = raw.match(RULE_HEADING);
		if (ruleMatch) {
			finish();
			rule = { num: Number(ruleMatch[1]), title: '' };
			lastSituationNum = 0;
			readingRuleTitle = true;
			continue;
		}

		const situationMatch = raw.match(SITUATION_START);
		if (situationMatch && rule) {
			finish();
			readingRuleTitle = false;
			const num = Number(situationMatch[1]);
			if (num !== lastSituationNum + 1) {
				problems.push({ page, reason: `Rule ${rule.num} Situation ${num} found, expected ${lastSituationNum + 1}` });
			}
			lastSituationNum = num;
			current = openChunk(`Rule ${rule.num}, Situation ${num}`, `Rules Interpretations > ${rulePath(rule)}`, page);
			current.lines.push(clean(raw));
			continue;
		}

		if (rule && readingRuleTitle) {
			rule.title = rule.title ? `${rule.title} ${clean(raw)}` : clean(raw);
			continue;
		}

		if (!current) {
			problems.push({ page, reason: `Interpretation text outside any situation: "${clean(raw).slice(0, 60)}"` });
			continue;
		}

		current.lines.push(clean(raw));
	}

	finish();
}

function openChunk(ruleRef: string, headingPath: string, page: number): OpenChunk {
	return { ruleRef, headingPath, page, lines: [], isTable: false };
}

/** Finalizes an open chunk. Empty ones (a section heading followed straight by an article) are dropped. */
function addChunk(chunks: ParsedChunk[], open: OpenChunk, type: ParsedChunk['type']) {
	// Tables keep their line breaks so each row stays on its own line.
	const text = (open.isTable ? open.lines.join('\n') : rejoinLines(open.lines)).trim();
	if (text === '') return;
	chunks.push({ ruleRef: open.ruleRef, type, headingPath: open.headingPath, text, page: open.page });
}

/**
 * The PDF gives us visual lines, wrapped wherever the page ran out of width.
 * Rejoin them into paragraphs, but keep numbered items, lettered items, bullets
 * and notes on their own lines so lists stay readable.
 */
function rejoinLines(lines: string[]): string {
	let text = '';
	for (const line of lines) {
		if (text === '') text = line;
		else if (STARTS_NEW_LINE.test(line)) text += '\n' + line;
		else if (text.endsWith('-') || text.endsWith('—')) text += line;
		else text += ' ' + line;
	}
	return text;
}

function rulePath(rule: { num: number; title: string }): string {
	return `Rule ${rule.num} – ${rule.title}`;
}

function clean(raw: string): string {
	return raw.replace(/�/g, '.');
}

function isAllCaps(text: string): boolean {
	return text === text.toUpperCase() && /[A-Z]/.test(text);
}
