import {
	addChunk as addSharedChunk,
	clean,
	collectLines,
	isAllCaps,
	openChunk,
	rulePath,
	titleCase,
	type Line,
	type OpenChunk
} from './pdf-lines.ts';
import type { PageProblem, ParsedChunk, ParseResult, Source } from './types.ts';

// Chunker for NCAA rulebooks with numbered sections but no article titles (e.g. soccer):
//   RULE 1                     rule
//   The Field of Play          rule title
//   1.1 DIMENSIONS             section (title in caps)
//   1�1�1 The field of ...     article  <- one chunk per article; text starts on the same line
//   1�1�1�1 Facilities ...     sub-article, stays in its article
//   PENALTY—...                penalty for the article(s) above, stays in the last one
//
// Like the volleyball book, headings print with a real period and body text prints "�"
// (see clean()). Unlike it, articles have no titles: "1�1�1 The field of play shall be..."
// is both the article's number and its first line of text, and the book cites it as Rule 1.1.1.
//
// A few articles run long (Rule 5.7.4 on video review is ~740 words). Those are split at
// their sub-articles into ~500-word pieces: "Rule 5.7.4", then "Rule 5.7.4.3–5.7.4.5".
//
// Before Rule 1, the book's introduction ("The Rules", sportsmanship, governing sports
// authority) is one chunk per all-caps heading.

const RULE_HEADING = /^RULE (\d+)$/;
const SECTION_HEADING = /^(\d+)\.(\d+) (.+)$/;
// "1�1�1 The field..." but not "1�1�1�1 ..." (a sub-article). A few print with a
// trailing period ("12�7�5� Denying...").
const ARTICLE_START = /^(\d+)�(\d+)�(\d+)�?\s/;
// A sub-article, after clean(): "5.7.4.1 ..." (not "5.7.4.1.1", which stays with its parent).
const SUB_ARTICLE = /^\d+\.\d+\.\d+\.(\d+)\s/;
// Most article numbers a new article may skip ahead by (see the gap check below).
const MAX_ARTICLE_GAP = 3;
// Offside is explained with numbered diagrams, each with a caption that reads on its own.
const DIAGRAM_HEADING = /^OFFSIDE—Diagram (\d+)$/;
const DIAGRAMS_INTRO = 'DIAGRAMS ILLUSTRATING OFFSIDE POINTS';
// Unnumbered headings inside a rule that start their own chunk.
const RULE_SUBHEADINGS = new Set(['RECOMMENDED TIMING SHEETS', 'Sample Accumulation Charts']);

// When rejoining wrapped lines, these start a new line: sub-articles, lettered items,
// bullets, penalties, notes, exceptions and worked examples.
const STARTS_NEW_LINE =
	/^(\d+(\.\d+){2,}\s|\([a-z]\)\s|[a-z]\.\s|•|PENALT|Note:|NOTE:|Exception|Example|Explanation:|Result:|Scenario)/;

// Articles longer than this are split; pieces aim for about TARGET_WORDS.
const MAX_WORDS = 600;
const TARGET_WORDS = 500;

/** An open chunk that also remembers which page each line came from, for split pieces. */
interface ArticleChunk extends OpenChunk {
	linePages: number[];
}

export function parseNcaaArticles(pages: string[], source: Source): ParseResult {
	const chunks: ParsedChunk[] = [];
	const problems: PageProblem[] = [];

	for (const range of source.ranges) {
		parseRules(collectLines(pages, range, source, problems), chunks, problems);
	}

	return { chunks, problems };
}

function parseRules(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let rule: { num: number; title: string } | null = null;
	let section: { num: number; title: string } | null = null;
	let lastArticleNum = 0;
	let readingRuleTitle = false;
	let current: ArticleChunk | null = null;
	// The finished chunks of the current section (its opening text, then its articles),
	// held until the section ends so a list section can be grouped (see addSection).
	let sectionChunks: ArticleChunk[] = [];

	// finish() closes the open chunk; flush() also ends the section.
	const finish = () => {
		if (current) sectionChunks.push(current);
		current = null;
	};
	const flush = () => {
		finish();
		addSection(chunks, sectionChunks);
		sectionChunks = [];
	};
	const open = (ref: string, path: string, page: number): ArticleChunk => ({ ...openChunk(ref, path, page), linePages: [] });
	const addLine = (raw: string, page: number) => {
		current!.lines.push(clean(raw));
		current!.linePages.push(page);
	};

	for (const { raw, page } of lines) {
		const ruleMatch = raw.match(RULE_HEADING);
		if (ruleMatch) {
			flush();
			const num = Number(ruleMatch[1]);
			if (num !== (rule ? rule.num + 1 : 1)) {
				problems.push({ page, reason: `Rule ${num} follows Rule ${rule?.num ?? 'none'}, a rule heading may be missing` });
			}
			rule = { num, title: '' };
			section = null;
			readingRuleTitle = true;
			continue;
		}

		if (!rule) {
			// The introduction before Rule 1: a chunk per all-caps heading.
			if (isAllCaps(raw) || raw === 'The Rules') {
				flush();
				const title = raw === 'The Rules' ? raw : titleCase(clean(raw));
				current = open(title, title === 'The Rules' ? title : `The Rules > ${title}`, page);
				continue;
			}
			if (!current) {
				problems.push({ page, reason: `Text before the first heading: "${clean(raw).slice(0, 60)}"` });
				continue;
			}
			addLine(raw, page);
			continue;
		}

		const sectionMatch = raw.match(SECTION_HEADING);
		if (sectionMatch && Number(sectionMatch[1]) === rule.num && isAllCaps(sectionMatch[3])) {
			flush();
			const num = Number(sectionMatch[2]);
			const expected: number = section ? section.num + 1 : 1;
			if (num !== expected) {
				problems.push({ page, reason: `Section ${rule.num}.${num} found, expected ${rule.num}.${expected}` });
			}
			section = { num, title: clean(sectionMatch[3]) };
			lastArticleNum = 0;
			readingRuleTitle = false;
			// Text between a section heading and its first article becomes the section's own chunk.
			current = open(`Rule ${rule.num}.${num}`, sectionPath(rule, section), page);
			continue;
		}

		// Only an article a little ahead of the last one starts a chunk. A wrapped line can begin
		// with a cross-reference ("12�7�1 for ..."), which must stay text. Small gaps are real:
		// the book drops deleted articles without renumbering (4.5.3 is followed by 4.5.6).
		const articleMatch = raw.match(ARTICLE_START);
		const inThisSection =
			articleMatch && section && Number(articleMatch[1]) === rule.num && Number(articleMatch[2]) === section.num;
		const articleNum = Number(articleMatch?.[3]);
		if (inThisSection && articleNum > lastArticleNum && articleNum <= lastArticleNum + MAX_ARTICLE_GAP) {
			finish();
			if (articleNum !== lastArticleNum + 1) {
				problems.push({ page, reason: `Article ${rule.num}.${section!.num}.${articleNum} follows ${rule.num}.${section!.num}.${lastArticleNum}, check the book skips the numbers between` });
			}
			lastArticleNum = articleNum;
			current = open(`Rule ${rule.num}.${section!.num}.${articleNum}`, sectionPath(rule, section!), page);
			addLine(raw, page);
			continue;
		}
		if (inThisSection && articleNum > lastArticleNum) {
			problems.push({ page, reason: `Line starts like article ${rule.num}.${section!.num}.${articleNum} but ${rule.num}.${section!.num}.${lastArticleNum + 1} is next, kept as text` });
		}

		if (raw === DIAGRAMS_INTRO) continue;
		const diagramMatch = raw.match(DIAGRAM_HEADING);
		if (diagramMatch) {
			flush();
			current = open(`Rule ${rule.num}, Diagram ${diagramMatch[1]}`, `${rulePath(rule)} > Diagrams Illustrating Offside Points`, page);
			continue;
		}

		if (RULE_SUBHEADINGS.has(raw)) {
			flush();
			const title = titleCase(raw);
			current = open(`Rule ${rule.num}, ${title}`, `${rulePath(rule)} > ${title}`, page);
			continue;
		}

		// A rule-level note (e.g. under Rule 10) ends the title and starts the rule's own chunk.
		if (readingRuleTitle && /^Note:/i.test(raw)) {
			readingRuleTitle = false;
			current = open(`Rule ${rule.num}`, rulePath(rule), page);
		}

		if (readingRuleTitle) {
			rule.title = rule.title ? `${rule.title} ${clean(raw)}` : clean(raw);
			continue;
		}

		if (!current) {
			problems.push({ page, reason: `Text outside any section in Rule ${rule.num}: "${clean(raw).slice(0, 60)}"` });
			continue;
		}

		addLine(raw, page);
	}

	flush();
}

function sectionPath(rule: { num: number; title: string }, section: { num: number; title: string }): string {
	return `${rulePath(rule)} > ${rule.num}.${section.num} ${section.title}`;
}

/**
 * Adds a finished section's chunks. Usually that's one chunk per article.
 *
 * Some sections are a list: a lead-in ending in a colon, then short articles that only make
 * sense after it ("A direct free kick is awarded when a player commits..." / "12.2.1 Charging
 * an opponent;"). Those articles are grouped into pieces of about TARGET_WORDS, each starting
 * with the lead-in: the whole section if it fits ("Rule 12.2"), else "Rule 12.7.1–12.7.4".
 */
function addSection(chunks: ParsedChunk[], sectionChunks: ArticleChunk[]) {
	const [intro, ...articles] = sectionChunks;
	const isList = intro && articles.length > 0 && /:$/.test(intro.lines.join(' ').trim());
	if (!isList) {
		for (const chunk of sectionChunks) addArticle(chunks, chunk);
		return;
	}

	// A long article inside a list is split on its own and not grouped with others.
	const isLong = (article: ArticleChunk) => wordCount(article.lines) > MAX_WORDS;
	const groups: ArticleChunk[][] = [];
	for (const article of articles) {
		const group = groups.at(-1);
		const fits = group && !isLong(group[0]) && !isLong(article) &&
			wordCount(group.flatMap((a) => a.lines)) + wordCount(article.lines) <= TARGET_WORDS;
		if (fits) group.push(article);
		else groups.push([article]);
	}

	const leadIn = intro.lines;
	groups.forEach((group, i) => {
		const first = group[0];
		const last = group.at(-1)!;
		const ref =
			groups.length === 1 ? intro.ruleRef : group.length === 1 ? first.ruleRef : `${first.ruleRef}–${last.ruleRef.slice(5)}`;
		if (isLong(first)) {
			// Split by its sub-articles; the lead-in still goes first.
			for (const piece of splitAtSubArticles(first)) {
				addSharedChunk(chunks, { ...piece, lines: [...leadIn, ...piece.lines] }, 'rule', STARTS_NEW_LINE);
			}
			return;
		}
		const page = i === 0 ? intro.page : first.page;
		const piece = { ...openChunk(ref, intro.headingPath, page), lines: [...leadIn, ...group.flatMap((a) => a.lines)] };
		addSharedChunk(chunks, piece, 'rule', STARTS_NEW_LINE);
	});
}

function wordCount(lines: string[]): number {
	return lines.join(' ').split(/\s+/).length;
}

/** Adds an article as one chunk, or as several pieces if it's long. */
function addArticle(chunks: ParsedChunk[], article: ArticleChunk) {
	const pieces = wordCount(article.lines) > MAX_WORDS ? splitAtSubArticles(article) : [article];
	for (const piece of pieces) addSharedChunk(chunks, piece, 'rule', STARTS_NEW_LINE);
}

/**
 * Splits a long article into pieces of roughly TARGET_WORDS, only ever breaking before a
 * sub-article ("5.7.4.3 ..."). The first piece keeps the article's ref ("Rule 5.7.4");
 * later ones are labeled with the sub-articles they hold ("Rule 5.7.4.3–5.7.4.5").
 */
function splitAtSubArticles(article: ArticleChunk): OpenChunk[] {
	// Group the lines into items: the article's opening text, then one per sub-article.
	interface Item { num: string; lines: string[]; page: number; words: number }
	const items: Item[] = [];
	article.lines.forEach((line, i) => {
		const subMatch = line.match(SUB_ARTICLE);
		if (subMatch || items.length === 0) {
			items.push({ num: subMatch?.[1] ?? '', lines: [], page: article.linePages[i], words: 0 });
		}
		const item = items[items.length - 1];
		item.lines.push(line);
		item.words += line.split(/\s+/).length;
	});

	const pieces: Item[][] = [];
	for (const item of items) {
		const piece = pieces.at(-1);
		const pieceWords = piece?.reduce((sum, it) => sum + it.words, 0) ?? 0;
		if (piece && pieceWords + item.words <= TARGET_WORDS) piece.push(item);
		else pieces.push([item]);
	}

	const base = article.ruleRef; // "Rule 5.7.4"
	return pieces.map((piece, i) => {
		const first = piece[0].num;
		const last = piece.at(-1)!.num;
		const ref = i === 0 ? base : first === last ? `${base}.${first}` : `${base}.${first}–${base.slice(5)}.${last}`;
		return { ...openChunk(ref, article.headingPath, piece[0].page), lines: piece.flatMap((it) => it.lines) };
	});
}
