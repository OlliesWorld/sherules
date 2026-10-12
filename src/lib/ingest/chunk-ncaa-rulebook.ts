import {
	addChunk as addSharedChunk,
	clean,
	collectLines,
	isAllCaps,
	openChunk,
	rulePath,
	type Line,
	type OpenChunk
} from './pdf-lines.ts';
import type { PageProblem, ParsedChunk, ParseResult, Source } from './types.ts';

// Chunker for NCAA rulebooks laid out with numbered headings (e.g. volleyball):
//   RULE 1                     rule
//   Facilities and Equipment   rule title (one or two lines)
//   1.2 THE COURT              section (title in caps)
//   1.2.2 Court Markings       article  <- one chunk per article
//   1�2�2�1 ...                numbered text inside the article
//
// Headings print with a real period; body text prints "�" for periods (see clean()).
// That is what tells "1.2.2 Court Markings" (a heading) apart from "1�2�2�1 ..." (text).

const RULE_HEADING = /^RULE (\d+)$/;
const SECTION_HEADING = /^(\d+)\.(\d+) (.+)$/;
const ARTICLE_HEADING = /^(\d+)\.(\d+)\.(\d+) (.+)$/;
const TABLE_START = /^Table (\d+)(?::\s*(.+))?$/; // "Table 1" or "Table 2: Prematch Protocol"
const SUB_ITEM = /^\d+\uFFFD\d+\uFFFD\d+\uFFFD\d+/; // "9�1�1�1 In a tournament..."
const SITUATION_START = /^SITUATION (\d+):/;

// When rejoining wrapped lines, these start a new line instead of continuing the previous one.
const STARTS_NEW_LINE = /^(\d+(\.\d+){3,}\s|[a-z]\.\s|•|Note:|NOTE:)/;

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

/** This parser's list-item pattern, passed to the shared chunk builder. */
function addChunk(chunks: ParsedChunk[], open: OpenChunk, type: ParsedChunk['type']) {
	addSharedChunk(chunks, open, type, STARTS_NEW_LINE);
}
