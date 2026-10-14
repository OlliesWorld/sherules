import type { PageProblem, PageRange, ParsedChunk, Source } from './types.ts';

// Helpers shared by the rulebook parsers: turning PDF pages into clean lines,
// and turning collected lines into chunks.

// "14 RULE 1 / FACILITIES AND EqUIPMENT" or "RULE 1 / COURT AND EqUIPMENT 19"
const RUNNING_HEADER = /^(\d+ )?RULE \d+ \//;
const PAGE_NUMBER = /^\d{1,3}$/;
// Dotted leaders before a page number, as in a table of contents or index.
const LEADER_LINE = /(�{4,}|\.{4,})\s*\d+$/;

export interface Line {
	/** The line as extracted, with "�" still in place of periods (see clean()). */
	raw: string;
	page: number;
}

/** A chunk while it is being filled, line by line. */
export interface OpenChunk {
	ruleRef: string;
	headingPath: string;
	page: number;
	lines: string[];
	isTable: boolean;
}

/**
 * Turns the pages in a range into a flat list of lines, dropping page furniture.
 * `isPageFurniture` lets a parser drop extra lines its book repeats on every page
 * (headers, side tabs) on top of the NCAA running headers handled here.
 */
export function collectLines(
	pages: string[],
	range: PageRange,
	source: Source,
	problems: PageProblem[],
	isPageFurniture?: (line: string) => boolean
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
			if (RUNNING_HEADER.test(raw) || isPageFurniture?.(raw)) continue;
			lines.push({ raw, page });
		}
	}

	return lines;
}

export function openChunk(ruleRef: string, headingPath: string, page: number): OpenChunk {
	return { ruleRef, headingPath, page, lines: [], isTable: false };
}

/**
 * Finalizes an open chunk. Empty ones (a heading followed straight by another) are dropped.
 * `startsNewLine` says which lines begin a new list item when rejoining wrapped text.
 */
export function addChunk(
	chunks: ParsedChunk[],
	open: OpenChunk,
	type: ParsedChunk['type'],
	startsNewLine: RegExp
) {
	// Tables keep their line breaks so each row stays on its own line.
	const text = (open.isTable ? open.lines.join('\n') : rejoinLines(open.lines, startsNewLine)).trim();
	if (text === '') return;
	chunks.push({ ruleRef: open.ruleRef, type, headingPath: open.headingPath, text, page: open.page });
}

/**
 * The PDF gives us visual lines, wrapped wherever the page ran out of width.
 * Rejoin them into paragraphs, but keep lines matching `startsNewLine`
 * (numbered items, lettered items, bullets, notes) on their own lines.
 */
export function rejoinLines(lines: string[], startsNewLine: RegExp): string {
	let text = '';
	for (const line of lines) {
		if (text === '') text = line;
		else if (startsNewLine.test(line)) text += '\n' + line;
		else if (text.endsWith('-') || text.endsWith('—')) text += line;
		else text += ' ' + line;
	}
	return text;
}

export function rulePath(rule: { num: number; title: string }): string {
	return `Rule ${rule.num} – ${rule.title}`;
}

/**
 * NCAA rulebook PDFs set body text in a font with no period glyph, so the extractor
 * returns "�" (U+FFFD) for every period. Headings use a font with a real period.
 * Parsers match patterns on the raw line first, then clean it.
 */
export function clean(raw: string): string {
	return raw.replace(/�/g, '.');
}

export function isAllCaps(text: string): boolean {
	return text === text.toUpperCase() && /[A-Z]/.test(text);
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);

/** "TO SCORE A POINT, TO WIN A SET" -> "To Score a Point, to Win a Set". For all-caps headings. */
export function titleCase(text: string): string {
	return text
		.toLowerCase()
		.split(' ')
		.map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
		.join(' ');
}

/**
 * Some PDFs print words broken across lines with a hyphen ("rectan-" / "gular").
 * Joins those back into one word when the next line continues in lowercase.
 * Real hyphenated words split at their hyphen ("warm-" / "up") lose the hyphen,
 * a small price for readable text.
 */
export function joinHyphenatedLines(lines: string[]): string[] {
	const joined: string[] = [];
	for (const line of lines) {
		const previous = joined.at(-1);
		if (previous && /[a-z]-$/.test(previous) && /^[a-z]/.test(line)) {
			joined[joined.length - 1] = previous.slice(0, -1) + line;
		} else {
			joined.push(line);
		}
	}
	return joined;
}
