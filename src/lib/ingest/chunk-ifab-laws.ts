import { addChunk as addSharedChunk, collectLines, joinHyphenatedLines, openChunk, type Line } from './pdf-lines.ts';
import type { PageProblem, PageRange, ParsedChunk, ParseResult, Source } from './types.ts';

// Chunker for the IFAB Laws of the Game (the laws NWSL plays under). Each Law reads:
//   1. Field surface                  numbered section  <- one chunk per section: "Law 1.1"
//   Official competitions             subheading (sentence case, no number)
//   The field of play must be ...     text, with • bullets
//
// The PDF is a two-page spread per file page, and the big printed labels come out jumbled:
//   - "Law" / "1" / "The Field of Play" (the Law's title block) lands anywhere on the page
//   - "119118" (both printed page numbers, glued together) starts each page
//   - the footer "Laws of the Game 2026/27 | Law 12 | Fouls and Misconduct" names the Law
// So the Law a page belongs to comes from its footer, and the title block is dropped.
//
// Ranges with a `title` (the protocols, the VAR protocol) are titled from sources.ts, since
// their printed titles sit in the margin and get mixed into the text. Their pieces are
// labeled with the title: "Time-limited substitution protocol", "VAR protocol, 2. Reviewable ...".
//
// Sections over ~600 words are split at their subheadings into ~500-word pieces.

// "Laws of the Game 2026/27 | Law 12 | ..." The extractor adds stray spaces ("L aws o f").
const FOOTER = /L ?aws o ?f the Game 2026\/27 \|/;
// The number can come out split too: "| L aw 1 4 |" is Law 14.
const FOOTER_LAW = /\| L ?aw (\d[\d ]*?) \|/;
// A numbered section heading: short, no closing punctuation. Long numbered lines are list items.
const SECTION_HEADING = /^(\d+)\. ([A-Z‘].{0,60})$/;
const PAGE_FURNITURE = /^(\d+|Law)$/;
// Captions from the referee signals graphic (Law 5) that come out glued together:
// "NEW CORNER KICK NEW PENALTY KICKPenalty kick", "Check: finger to ear,", "Review – TV Signal".
// Dropped wherever they appear, like page furniture.
const SIGNAL_CAPTION = /^NEW [A-Z]|^(• )?Check ?[:–] |^other hand\/arm extended|^Five-second countdownReview|^Review – TV Signal$/;

const LAW_TITLES: Record<number, string> = {
	1: 'The Field of Play',
	2: 'The Ball',
	3: 'The Players',
	4: 'The Players’ Equipment',
	5: 'The Referee',
	6: 'The Other Match Officials',
	7: 'The Duration of the Match',
	8: 'The Start and Restart of Play',
	9: 'The Ball in and out of Play',
	10: 'Determining the Outcome of a Match',
	11: 'Offside',
	12: 'Fouls and Misconduct',
	13: 'Free Kicks',
	14: 'The Penalty Kick',
	15: 'The Throw-in',
	16: 'The Goal Kick',
	17: 'The Corner Kick'
};

// When rejoining wrapped lines inside a paragraph, these start a new line.
const STARTS_NEW_LINE = /^(•|\*|\d+\.\s|[a-z]\.\s|NB:)/;
// Lines in a finished chunk are already joined into paragraphs, so each stays on its own line.
const EVERY_LINE = /^/;

const MAX_WORDS = 600;
const TARGET_WORDS = 500;

/** A section while it's being read: its text as a list of blocks, each led by an optional subheading. */
interface OpenSection {
	ruleRef: string;
	headingPath: string;
	page: number;
	blocks: { subheading: string; lines: string[]; page: number }[];
}

export function parseIfabLaws(pages: string[], source: Source): ParseResult {
	const chunks: ParsedChunk[] = [];
	const problems: PageProblem[] = [];

	for (const range of source.ranges) {
		const lines = withoutDiagramLabels(
			collectLines(pages, range, source, problems, (line) => FOOTER.test(line) || PAGE_FURNITURE.test(line) || SIGNAL_CAPTION.test(line))
		);
		if (range.title) {
			parseTitledPart(withoutMarginTitle(lines, range.title), range, chunks, problems);
		} else {
			parseLaws(lines, lawOfEachPage(pages, range, problems), chunks, problems);
		}
	}

	return { chunks, problems };
}

/** Reads each page's footer for its Law number. A page without one continues the Law before it. */
function lawOfEachPage(pages: string[], range: PageRange, problems: PageProblem[]): Map<number, number> {
	const laws = new Map<number, number>();
	let law = 0;
	for (let page = range.from; page <= range.to; page++) {
		const footerLaw = pages[page - 1]?.match(FOOTER_LAW);
		if (footerLaw) law = Number(footerLaw[1].replace(/ /g, ''));
		if (law === 0) problems.push({ page, reason: 'No Law footer found before this page' });
		laws.set(page, law);
	}
	return laws;
}

function parseLaws(lines: Line[], lawOfPage: Map<number, number>, chunks: ParsedChunk[], problems: PageProblem[]) {
	let law = 0;
	let lastSection = 0;
	let current: OpenSection | null = null;

	const finish = () => {
		if (current) addSection(chunks, current);
		current = null;
	};
	const lawPath = () => `Law ${law} – ${LAW_TITLES[law]}`;

	for (let i = 0; i < lines.length; i++) {
		const { raw, page } = lines[i];
		const pageLaw = lawOfPage.get(page) ?? 0;

		if (pageLaw !== law) {
			finish();
			if (pageLaw !== law + 1) problems.push({ page, reason: `Law ${pageLaw} follows Law ${law}, a Law may be missing` });
			law = pageLaw;
			lastSection = 0;
			// Text before the first numbered section becomes the Law's own chunk.
			current = openSection(`Law ${law}`, lawPath(), page);
		}

		// The Law's printed title, part of the jumbled title block. It can wrap onto two
		// lines ("The Other" / "Match Officials").
		if (isPartOfTitle(raw, LAW_TITLES[law])) continue;

		const sectionMatch = raw.match(SECTION_HEADING);
		if (sectionMatch && Number(sectionMatch[1]) === lastSection + 1 && !/[.,;:]$/.test(raw)) {
			finish();
			lastSection += 1;
			current = openSection(`Law ${law}.${lastSection}`, `${lawPath()} > ${lastSection}. ${sectionMatch[2]}`, page);
			continue;
		}

		addLine(current!, raw, page, lines[i - 1]?.raw, lines[i + 1]?.raw);
	}

	finish();
}

/** A protocol or the VAR protocol: one chunk per numbered section, or for the whole part if it has none. */
function parseTitledPart(lines: Line[], range: PageRange, chunks: ParsedChunk[], problems: PageProblem[]) {
	const title = range.title!;
	let lastSection = 0;
	let current = openSection(title, title, range.from);

	for (let i = 0; i < lines.length; i++) {
		const { raw, page } = lines[i];
		const sectionMatch = raw.match(SECTION_HEADING);
		if (sectionMatch && Number(sectionMatch[1]) === lastSection + 1 && !/[.,;:]$/.test(raw)) {
			addSection(chunks, current);
			lastSection += 1;
			const name = `${lastSection}. ${sectionMatch[2]}`;
			current = openSection(`${title}, ${name}`, `${title} > ${name}`, page);
			continue;
		}
		addLine(current, raw, page, lines[i - 1]?.raw, lines[i + 1]?.raw);
	}

	addSection(chunks, current);
	if (chunks.length === 0) problems.push({ page: range.from, reason: `No text found for ${title}` });
}

/**
 * Drops the labels of a diagram (the field of play in Law 1, the referee signals in Law 5),
 * which come out as a run of short lines: "corner area" / "7.32 m (8 yds)" / "(10 yds)", or
 * "Advantage (1)" / "FREE KICK". Real text doesn't look like that: wrapped lines are long,
 * and short ones end a sentence or start a bullet.
 */
function withoutDiagramLabels(lines: Line[]): Line[] {
	const isCaps = (line = '') => /[A-Z]{2}/.test(line) && !/[a-z]/.test(line);
	const isLabel = (i: number) => {
		const line = lines[i].raw;
		if (isCaps(line) || /^(min\.|\d+(\.\d+)? m\b)/.test(line)) return true;
		const short = line.split(' ').length <= 6 && !/[.:;]$/.test(line);
		// A short caption beside an all-caps label ("Direct free kick" under "FREE KICK").
		const besideCaps = isCaps(lines[i - 1]?.raw) || isCaps(lines[i + 1]?.raw);
		return short && (/^[a-z(\d]/.test(line) || (besideCaps && line.split(' ').length <= 4));
	};
	const result: Line[] = [];
	for (let i = 0; i < lines.length; ) {
		let end = i;
		while (end < lines.length && isLabel(end)) end++;
		if (end - i >= 3) {
			i = end; // a run of three or more labels: a diagram
		} else {
			result.push(lines[i]);
			i++;
		}
	}
	return result;
}

/** "Match Officials" is part of "The Other Match Officials" (whole words, any spacing). */
function isPartOfTitle(line: string, title: string | undefined): boolean {
	if (!title) return false;
	const normalize = (text: string) => ` ${text.replace(/\s+/g, ' ').trim()} `;
	return normalize(title).includes(normalize(line));
}

function openSection(ruleRef: string, headingPath: string, page: number): OpenSection {
	return { ruleRef, headingPath, page, blocks: [{ subheading: '', lines: [], page }] };
}

/** Adds a line to the open section, starting a new block if the line is a subheading. */
function addLine(section: OpenSection, line: string, page: number, previous?: string, next?: string) {
	if (isSubheading(line, previous, next)) {
		section.blocks.push({ subheading: line, lines: [], page });
	} else {
		section.blocks.at(-1)!.lines.push(line);
	}
}

/**
 * Subheadings ("Official competitions", "Playing in a dangerous manner") aren't marked in the
 * text, so they're recognized by shape: a short line starting with a capital, with no closing
 * punctuation, after the end of a sentence or list item and before the start of the next.
 * List items have no closing punctuation, so "ended" means the previous line doesn't stop
 * mid-phrase ("...communicate with").
 */
function isSubheading(line: string, previous?: string, next?: string): boolean {
	const words = line.split(' ').length;
	if (words > 8 || !/^[A-Z‘]/.test(line) || /[.,;:*]$/.test(line) || ENDS_MID_PHRASE.test(line)) return false;
	const previousEnded = !previous || !(/[,–-]$/.test(previous) || ENDS_MID_PHRASE.test(previous));
	const nextStarts = !next || /^[A-Z•‘(*]/.test(next);
	return previousEnded && nextStarts;
}

const ENDS_MID_PHRASE = /\b(and|or|of|the|a|an|to|for|with|by|in|on|at|is|are|be|if|that|which|their|its|from|as)$/;

/** Adds a section as one chunk, or as pieces split at its subheadings if it's long. */
function addSection(chunks: ParsedChunk[], section: OpenSection) {
	const blocks = section.blocks.filter((block) => block.subheading || block.lines.length > 0);
	const words = (block: OpenSection['blocks'][number]) => block.lines.join(' ').split(/\s+/).length;

	const pieces: OpenSection['blocks'][] = [];
	const total = blocks.reduce((sum, block) => sum + words(block), 0);
	for (const block of blocks) {
		const piece = pieces.at(-1);
		const pieceWords = piece?.reduce((sum, b) => sum + words(b), 0) ?? 0;
		if (piece && (total <= MAX_WORDS || pieceWords + words(block) <= TARGET_WORDS)) piece.push(block);
		else pieces.push([block]);
	}

	pieces.forEach((piece, i) => {
		// Later pieces are labeled with their first subheading: "Law 12.3 (Advantage)".
		const label = i > 0 && piece[0].subheading ? ` (${piece[0].subheading})` : i > 0 ? ` (part ${i + 1})` : '';
		const lines = piece.flatMap((block) => [
			...(block.subheading ? [block.subheading] : []),
			...(block.lines.length ? [rejoinParagraphs(joinHyphenatedLines(block.lines))] : [])
		]);
		const open = { ...openChunk(section.ruleRef + label, section.headingPath, piece[0].page), lines };
		addSharedChunk(chunks, open, 'rule', EVERY_LINE);
	});
}

/**
 * Rejoins wrapped lines into paragraphs. IFAB list items have no closing punctuation, so the
 * paragraph after a list ("• ...send off a player" / "An indirect free kick is...") can't be
 * told apart by punctuation. A line starting with a capital begins a new paragraph unless the
 * line before it stops mid-phrase, or it starts with a name like "Law" or "VAR".
 */
function rejoinParagraphs(lines: string[]): string {
	let text = '';
	lines.forEach((line, i) => {
		const previous = lines[i - 1];
		const startsParagraph =
			/^[A-Z‘]/.test(line) &&
			!/^(Law|Laws|[A-Z]{2,}|I|The IFAB)\b/.test(line) &&
			!/[,–-]$/.test(previous) &&
			!ENDS_MID_PHRASE.test(previous);
		if (i === 0) text = line;
		else if (STARTS_NEW_LINE.test(line) || startsParagraph) text += '\n' + line;
		else if (/[-—]$/.test(text)) text += line;
		else text += ' ' + line;
	});
	return text;
}

/**
 * Drops a margin title that the extractor split across lines and mixed into the text:
 * "Time-limited" / "substitution protocol • The one minute is..." becomes "• The one minute is...".
 * Reads the title's words off the start of consecutive lines, in order.
 */
function withoutMarginTitle(lines: Line[], title: string): Line[] {
	const titleWords = title.replace(/[‘’']/g, '').split(' ');
	const result: Line[] = [];
	let matched = 0; // how many title words have been seen so far

	for (const line of lines) {
		if (matched >= titleWords.length) {
			result.push(line);
			continue;
		}
		const words = line.raw.split(' ');
		let n = 0;
		while (n < words.length && matched + n < titleWords.length && words[n].replace(/[‘’']/g, '') === titleWords[matched + n]) n++;
		// Only a run that starts the title, or continues one already started, counts.
		if (n > 0 && (matched > 0 || n === words.length || n >= 2)) {
			matched += n;
			const rest = words.slice(n).join(' ');
			if (rest) result.push({ ...line, raw: rest });
		} else {
			if (matched > 0) matched = titleWords.length; // the title ended early; stop looking
			result.push(line);
		}
	}
	return result;
}
