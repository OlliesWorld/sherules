import { addChunk as addSharedChunk, collectLines, openChunk, titleCase, type Line, type OpenChunk } from './pdf-lines.ts';
import type { PageProblem, PageRange, ParsedChunk, ParseResult, Source } from './types.ts';

// Chunker for the NCAA Men's and Women's Ice Hockey Rules:
//   SECTION 12                               section
//   Women’s Ice Hockey                       section title
//   RULE 94 - RULES FOR WOMEN’S ICE HOCKEY   rule
//   94.1 Body Checking - Body checking ...   article  <- one chunk per article: "Rule 94.1"
//   PENALTY—A minor, major ...               stays in its article
//   55.2 A player, coach or ...              some articles have no title
//
// Unlike the other NCAA books, this one prints real periods, so headings and text look
// alike; an article is recognized by its number matching the current rule and coming
// next in sequence.
//
// Ranges with a `title` are appendices (shootout protocol, 3-on-3 overtime, ...): one chunk
// each, or ~500-word pieces at their numbered steps if long.
//
// Long articles (Rule 94.1 carries the women's body-contact point of emphasis and its
// scenarios) are split at their lettered/numbered items or scenarios into ~500-word pieces.

const SECTION_HEADING = /^SECTION (\d+)$/;
const RULE_HEADING = /^RULE (\d+) - (.+)$/;
// A removed rule keeps its number: "OLD RULE 60 - OBSTRUCTION" / "Rule 61 has been removed...".
const OLD_RULE_HEADING = /^OLD RULE (\d+) - /;
const ARTICLE_START = /^(\d+)\.(\d+) (.*)$/;
// "Body Checking - Body checking is..." or "Penalty Shot – No defending player..."
const ARTICLE_TITLE = /^([A-Z][^.]{0,70}?) [-–] (.*)$/;
// Running headers: "12 SECTION 1 / PLAyING AREA", "SECTION 1 / PLAyING AREA 13",
// "134APPENdIx E /ACCOmmOdATIONS ...", "REfERENCE TABLES 127". The book's font mixes cases.
const RUNNING_HEADER = /^(\d+ ?)?(SECTION \d+ \/|APPEN[dD][iI][xX] [A-G] ?\/|REfERENCE TABLES)/;
// Most article numbers a new article may skip ahead by (deleted articles aren't renumbered).
const MAX_ARTICLE_GAP = 3;

const STARTS_NEW_LINE = /^(PENALTY|Note:|Exception|\([a-z]+\)\s|\(\d+\)\s|[a-z]\.\s|\d+\.\s|•|Scenario \d+|The Play:|The Ruling:|Definitions|Interpretations)/;
// Where a long article may be split.
const SPLIT_POINT = /^(\([a-z]+\)\s|[a-z]\.\s|\d+\.\s|Scenario \d+|Definitions|Interpretations)/;

const MAX_WORDS = 600;
const TARGET_WORDS = 500;

/** An open chunk that also remembers which page each line came from, for split pieces. */
interface ArticleChunk extends OpenChunk {
	linePages: number[];
}

export function parseNcaaHockey(pages: string[], source: Source): ParseResult {
	const chunks: ParsedChunk[] = [];
	const problems: PageProblem[] = [];

	for (const range of source.ranges) {
		const lines = collectLines(pages, range, source, problems, (line) => RUNNING_HEADER.test(line));
		if (range.title) parseAppendix(lines, range, chunks);
		else parseRules(lines, chunks, problems);
	}

	return { chunks, problems };
}

function parseRules(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let section = '';
	let readingSectionTitle = false;
	let rule: { num: number; title: string } | null = null;
	let lastArticle = 0;
	let current: ArticleChunk | null = null;

	const finish = () => {
		if (current) addArticle(chunks, current);
		current = null;
	};
	const open = (ref: string, path: string, page: number): ArticleChunk => ({ ...openChunk(ref, path, page), linePages: [] });
	const rulePath = () => `${section} > Rule ${rule!.num} – ${rule!.title}`;

	for (const { raw, page } of lines) {
		const sectionMatch = raw.match(SECTION_HEADING);
		if (sectionMatch) {
			finish();
			section = `Section ${sectionMatch[1]}`;
			readingSectionTitle = true;
			continue;
		}
		if (readingSectionTitle) {
			section += ` – ${raw}`;
			readingSectionTitle = false;
			// Text before the section's first rule (Section 3 opens with an equipment preface).
			current = open(section.split(' – ')[0], section, page);
			continue;
		}

		const oldRule = raw.match(OLD_RULE_HEADING);
		if (oldRule) {
			finish();
			rule = { num: Number(oldRule[1]), title: '' };
			continue; // its only text is a removal notice, which isn't ingested
		}

		const ruleMatch = raw.match(RULE_HEADING);
		if (ruleMatch) {
			finish();
			const num = Number(ruleMatch[1]);
			if (rule && num !== rule.num + 1) problems.push({ page, reason: `Rule ${num} follows Rule ${rule.num}` });
			rule = { num, title: titleCase(ruleMatch[2]) };
			lastArticle = 0;
			// Text before the first article becomes the rule's own chunk.
			current = open(`Rule ${num}`, rulePath(), page);
			continue;
		}

		if (!current) {
			if (!rule?.title) continue; // a removed rule's notice
			problems.push({ page, reason: `Text outside any rule: "${raw.slice(0, 60)}"` });
			continue;
		}

		// Only an article of this rule, a little ahead of the last one, starts a chunk. A wrapped
		// line can begin with a reference ("71.2 and 76.3)."), which must stay text.
		const articleMatch = raw.match(ARTICLE_START);
		const articleNum = Number(articleMatch?.[2]);
		if (
			articleMatch &&
			rule &&
			Number(articleMatch[1]) === rule.num &&
			articleNum > lastArticle &&
			articleNum <= lastArticle + MAX_ARTICLE_GAP
		) {
			finish();
			if (articleNum !== lastArticle + 1) {
				problems.push({ page, reason: `Article ${rule.num}.${articleNum} follows ${rule.num}.${lastArticle}, check the book skips the numbers between` });
			}
			lastArticle = articleNum;
			const titled = articleMatch[3].match(ARTICLE_TITLE);
			const title = titled ? ` > ${rule.num}.${articleNum} ${titled[1]}` : '';
			current = open(`Rule ${rule.num}.${articleNum}`, rulePath() + title, page);
			current.lines.push(titled ? titled[2] : articleMatch[3]);
			current.linePages.push(page);
			continue;
		}

		current.lines.push(raw);
		current.linePages.push(page);
	}

	finish();
}

/** An appendix: its title comes from the range, so the printed title lines are dropped. */
function parseAppendix(lines: Line[], range: PageRange, chunks: ParsedChunk[]) {
	const title = range.title!;
	const article: ArticleChunk = { ...openChunk(title, title, range.from), linePages: [] };
	let readingTitle = true;
	for (const { raw, page } of lines) {
		// "Appendix B" / "NCAA Ice Hockey Shootout" / "Protocol" before the text starts.
		if (readingTitle && (/^Appendix [A-G]$/.test(raw) || isPartOfTitle(raw, title))) continue;
		readingTitle = false;
		article.lines.push(raw);
		article.linePages.push(page);
	}
	addArticle(chunks, article);
}

/** "Protocol" is part of "Appendix B – NCAA Ice Hockey Shootout Protocol" (whole words). */
function isPartOfTitle(line: string, title: string): boolean {
	return ` ${title} `.includes(` ${line.trim()} `);
}

/** Adds an article as one chunk, or as ~500-word pieces at its items if it's long. */
function addArticle(chunks: ParsedChunk[], article: ArticleChunk) {
	const add = (open: OpenChunk) => addSharedChunk(chunks, open, 'rule', STARTS_NEW_LINE);
	if (wordCount(article.lines) <= MAX_WORDS) {
		add(article);
		return;
	}

	const pieces: { lines: string[]; page: number }[] = [];
	article.lines.forEach((line, i) => {
		const piece = pieces.at(-1);
		// A new item, or a sentence that starts a new line, can start a piece.
		const previous = article.lines[i - 1] ?? '';
		const canSplit = SPLIT_POINT.test(line) || (/\.$/.test(previous) && /^[A-Z]/.test(line));
		const startsPiece = !piece || (canSplit && wordCount(piece.lines) + wordCount([line]) > TARGET_WORDS);
		if (startsPiece) pieces.push({ lines: [line], page: article.linePages[i] });
		else piece.lines.push(line);
	});
	pieces.forEach((piece, i) => {
		const label = i === 0 ? '' : ` (part ${i + 1})`;
		add({ ...openChunk(article.ruleRef + label, article.headingPath, piece.page), lines: piece.lines });
	});
}

function wordCount(lines: string[]): number {
	return lines.join(' ').split(/\s+/).length;
}
