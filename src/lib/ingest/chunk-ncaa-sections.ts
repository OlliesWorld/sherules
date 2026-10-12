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

// Chunker for NCAA rulebooks laid out with labeled headings (e.g. basketball):
//   RULE 1                                rule
//   Court and Equipment                   rule title
//   SECTION 2. THE PLAYING COURT          section (title in caps, may wrap to a second line)
//   Art. 3. The court dimensions ...      article  <- one chunk per article; text starts on the same line
//   PENALTY (Section 1): ...              penalty for a whole section <- its own chunk
//
// References follow the book's own style: Rule 1-2.3 (rule-section.article).

const RULE_HEADING = /^RULE (\d+)$/;
const SECTION_HEADING = /^SECTION (\d+)\. (.+)$/;
const ARTICLE_HEADING = /^Art\. (\d+)\.\s*(.*)$/;
// "PENALTY:", "PENALTY (Section 1):", "PENALTIES (Sections 2-3): The ball shall..."
// The colon matters: "PENALTY—One free throw..." (with a dash) is an inline penalty
// for the sub-items just above it, so it stays inside its article.
const PENALTY_START = /^PENALT(?:Y|IES)\s*(?:\(([^)]+)\))?\s*:\s*(.*)$/;

// When rejoining wrapped lines, these start a new line: lettered and numbered
// list items, bullets, notes, exceptions and inline penalties.
const STARTS_NEW_LINE = /^([a-z]\.\s|\d+\.\s|•|Note:|NOTE:|Exception|PENALTY)/;

// A rule title is short. Anything after this many lines (before the first section)
// is rule-level text and gets its own chunk.
const MAX_RULE_TITLE_LINES = 2;

export function parseNcaaSections(pages: string[], source: Source): ParseResult {
	const chunks: ParsedChunk[] = [];
	const problems: PageProblem[] = [];

	for (const range of source.ranges) {
		if (range.type !== 'rule') {
			problems.push({ page: range.from, reason: `Range type "${range.type}" isn't supported by this parser, skipped` });
			continue;
		}
		parseRules(collectLines(pages, range, source, problems), chunks, problems);
	}

	return { chunks, problems };
}

function parseRules(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let rule: { num: number; title: string; titleLines: number } | null = null;
	// leadIn: a section's opening phrase that its articles complete, e.g. "The officials shall:"
	let section: { num: number; title: string; leadIn?: string } | null = null;
	let lastArticleNum = 0;
	let readingRuleTitle = false;
	let readingSectionTitle = false;
	let current: OpenChunk | null = null;

	const finish = () => {
		if (current) addChunk(chunks, current, 'rule');
		current = null;
	};

	const sectionPath = () => {
		if (!rule || !section) return '';
		const leadIn = section.leadIn ? ` (${section.leadIn})` : '';
		return `${rulePath(rule)} > Section ${section.num}. ${section.title}${leadIn}`;
	};

	for (const { raw, page } of lines) {
		const ruleMatch = raw.match(RULE_HEADING);
		if (ruleMatch) {
			finish();
			const num = Number(ruleMatch[1]);
			if (rule && num !== rule.num + 1) {
				problems.push({ page, reason: `Rule ${num} follows Rule ${rule.num}, a rule heading may be missing` });
			}
			rule = { num, title: '', titleLines: 0 };
			section = null;
			readingRuleTitle = true;
			readingSectionTitle = false;
			continue;
		}

		if (!rule) {
			problems.push({ page, reason: `Text before the first RULE heading: "${clean(raw).slice(0, 60)}"` });
			continue;
		}

		const sectionMatch = raw.match(SECTION_HEADING);
		if (sectionMatch) {
			finish();
			const num = Number(sectionMatch[1]);
			const expected: number = section ? section.num + 1 : 1;
			if (num !== expected) {
				problems.push({ page, reason: `Section ${rule.num}-${num} found, expected ${rule.num}-${expected}` });
			}
			section = { num, title: clean(sectionMatch[2]) };
			lastArticleNum = 0;
			readingRuleTitle = false;
			readingSectionTitle = true;
			// Text between a section heading and its first article becomes its own chunk.
			current = openChunk(`Rule ${rule.num}-${num}`, sectionPath(), page);
			continue;
		}

		// Long section titles wrap onto a second all-caps line.
		if (readingSectionTitle && section && isAllCaps(raw) && !ARTICLE_HEADING.test(raw)) {
			section.title += ` ${clean(raw)}`;
			if (current) current.headingPath = sectionPath();
			continue;
		}
		readingSectionTitle = false;

		const articleMatch = raw.match(ARTICLE_HEADING);
		if (articleMatch && section) {
			// A short section intro ending in ":" ("The scorers shall:") only makes sense with
			// its articles, so it goes into their heading path instead of becoming a chunk.
			if (lastArticleNum === 0 && current && isLeadIn(current.lines)) {
				section.leadIn = current.lines.join(' ');
				current = null;
			}
			finish();
			const num = Number(articleMatch[1]);
			if (num !== lastArticleNum + 1) {
				problems.push({ page, reason: `Article ${rule.num}-${section.num}.${num} found, expected ${rule.num}-${section.num}.${lastArticleNum + 1}` });
			}
			lastArticleNum = num;
			current = openChunk(`Rule ${rule.num}-${section.num}.${num}`, `${sectionPath()} > Art. ${num}`, page);
			// The article's text starts on the heading line itself.
			if (articleMatch[2]) current.lines.push(clean(articleMatch[2]));
			continue;
		}

		const penaltyMatch = raw.match(PENALTY_START);
		if (penaltyMatch && section) {
			finish();
			// Label as printed, e.g. "Sections 2-3"; a bare "PENALTY:" applies to the current section.
			const covers = penaltyMatch[1] ? clean(penaltyMatch[1]).trim() : `Section ${section.num}`;
			// "(Art. 2.d and .e)" means articles of the current section, so name the section too.
			const coversArticles = covers.startsWith('Art');
			const ref = coversArticles
				? `Rule ${rule.num}-${section.num}, Penalty (${covers})`
				: `Rule ${rule.num}, Penalty (${covers})`;
			const path = coversArticles ? `${sectionPath()} > Penalty (${covers})` : `${rulePath(rule)} > Penalty (${covers})`;
			current = openChunk(uniqueRef(chunks, ref), path, page);
			if (penaltyMatch[2]) current.lines.push(clean(penaltyMatch[2]));
			continue;
		}

		if (readingRuleTitle) {
			if (rule.titleLines < MAX_RULE_TITLE_LINES) {
				rule.title = rule.title ? `${rule.title} ${clean(raw)}` : clean(raw);
				rule.titleLines++;
				continue;
			}
			// Past the title: rule-level text before the first section.
			readingRuleTitle = false;
			current = openChunk(`Rule ${rule.num}`, rulePath(rule), page);
		}

		if (!current) {
			problems.push({ page, reason: `Text outside any section in Rule ${rule.num}: "${clean(raw).slice(0, 60)}"` });
			continue;
		}

		current.lines.push(clean(raw));
	}

	finish();
}

function isLeadIn(lines: string[]): boolean {
	const text = lines.join(' ').trim();
	return text.endsWith(':') && text.split(/\s+/).length <= 12;
}

/** A rule can print the same penalty label twice; number repeats so ids stay unique. */
function uniqueRef(chunks: ParsedChunk[], ref: string): string {
	const count = chunks.filter((chunk) => chunk.ruleRef === ref || chunk.ruleRef.startsWith(`${ref} #`)).length;
	return count === 0 ? ref : `${ref} #${count + 1}`;
}

/** This parser's list-item pattern, passed to the shared chunk builder. */
function addChunk(chunks: ParsedChunk[], open: OpenChunk, type: ParsedChunk['type']) {
	addSharedChunk(chunks, open, type, STARTS_NEW_LINE);
}
