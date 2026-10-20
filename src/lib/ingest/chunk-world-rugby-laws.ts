import { addChunk as addSharedChunk, collectLines, joinHyphenatedLines, openChunk, titleCase, type Line, type OpenChunk } from './pdf-lines.ts';
import type { PageProblem, PageRange, ParsedChunk, ParseResult, Source } from './types.ts';

// Chunker for World Rugby's Laws of the Game. Inside each Law:
//   PRINCIPLE                          the Law's opening principle  <- "Law 14, Principle"
//   PLAYER RESPONSIBILITIES            all-caps subheading          <- one chunk per subheading
//   5. Tacklers must:                  numbered law (numbering runs through the whole Law)
//   a. Tackle below ...                lettered item
//   Sanction: Penalty
// A chunk is labeled with the laws it holds, the way the book cites them: "Law 14.5–14.7".
//
// The page footer ("LAW 14 Tackle") names the Law, so that's how pages are assigned.
//
// The PDF's text layer has no sentence periods ("...the touchlines It includes...") and
// prints references with a space ("Law 9 13"), so restorePunctuation() puts them back.
//
// Ranges:
//   layout 'definitions'  "Advantage: A clear and real ..."   <- one chunk per term
//   title 'Sevens'        LAW 3: TEAM / "1 Each team..." / "Replaced by:" / "1. Each team..."
//                         <- "Sevens: Law 3", the variations for one Law

const FOOTER_LAW = /^LAW (\d+) (.+)$/;
// Repeated on every page: "WORLD RUGBY" and the page number (sometimes glued to the end of a
// line, as in "Sanction: PenaltyWORLD RUGBY"), and "71LAWS OF THE GAME RUGBY UNION 2026".
const PAGE_FURNITURE = /^(\d+|WORLD RUGBY\d*|\d*LAWS OF THE GAME RUGBY UNION 2026|LAW \d+ .+|SEVENS Law variations|DEFINITIONS)$/;
const GLUED_FURNITURE = /WORLD RUGBY$/;

const SUBHEADING = /^[A-Z][A-Z0-9 ,’'()/-]{3,}$/;
const NUMBERED_LAW = /^(\d+)\. /;
// "Advantage: A clear ..." or "50:22: When a ball ..." (a term with a colon in it).
const DEFINITION = /^([A-Z0-9‘'][^:]{0,60}(?::\d+)?): (.*)$/;
const SEVENS_LAW = /^LAW (\d+): (.+)$/;

const STARTS_NEW_LINE = /^(\d+[a-z]?\.?\s|[a-z]\.\s|[ivx]+\.\s|Sanction:|Exception|Note:|In sevens|Law \d+\.\d+)/;

const MAX_WORDS = 600;
const TARGET_WORDS = 500;

export function parseWorldRugbyLaws(pages: string[], source: Source): ParseResult {
	const chunks: ParsedChunk[] = [];
	const problems: PageProblem[] = [];

	for (const range of source.ranges) {
		const lines = collectLines(pages, range, source, problems, (line) => PAGE_FURNITURE.test(line))
			.map((line) => ({ ...line, raw: line.raw.replace(GLUED_FURNITURE, '').trim() }))
			// Diagram captions sometimes come out twice in a row.
			.filter((line, i, all) => line.raw !== '' && line.raw !== all[i - 1]?.raw);
		if (range.layout === 'definitions') parseDefinitions(lines, chunks, problems);
		else if (range.title === 'Sevens') parseSevens(lines, chunks, problems);
		else parseLaws(lines, lawOfEachPage(pages, range, problems), chunks, problems);
	}

	return { chunks, problems };
}

/** Reads each page's footer ("LAW 14 Tackle") for its Law number and title. */
function lawOfEachPage(pages: string[], range: PageRange, problems: PageProblem[]) {
	const laws = new Map<number, { num: number; title: string }>();
	for (let page = range.from; page <= range.to; page++) {
		const footer = (pages[page - 1] ?? '').split('\n').map((line) => line.trim().match(FOOTER_LAW)).find(Boolean);
		if (footer) laws.set(page, { num: Number(footer[1]), title: footer[2] });
		else problems.push({ page, reason: 'No Law footer on this page' });
	}
	return laws;
}

/** A subheading's group of laws while it's being read. */
interface Group {
	subheading: string;
	page: number;
	items: { num: number; lines: string[]; page: number }[];
}

function parseLaws(
	lines: Line[],
	lawOfPage: Map<number, { num: number; title: string }>,
	chunks: ParsedChunk[],
	problems: PageProblem[]
) {
	let law: { num: number; title: string } | null = null;
	let lastNum = 0;
	let group: Group | null = null;

	const finish = () => {
		if (group && law) addGroup(chunks, law, group);
		group = null;
	};
	const startGroup = (subheading: string, page: number) => {
		finish();
		group = { subheading, page, items: [{ num: 0, lines: [], page }] };
	};

	for (const { raw, page } of lines) {
		const pageLaw = lawOfPage.get(page);
		if (pageLaw && pageLaw.num !== law?.num) {
			finish();
			if (pageLaw.num !== (law ? law.num + 1 : 1)) problems.push({ page, reason: `Law ${pageLaw.num} follows Law ${law?.num ?? 'none'}` });
			law = pageLaw;
			lastNum = 0;
			startGroup('', page);
		}
		if (!law || !group) continue;

		// The Law's own title, printed near its start ("Tackle").
		if (raw === law.title) continue;

		if (SUBHEADING.test(raw)) {
			startGroup(titleCase(raw), page);
			continue;
		}

		const numbered = raw.match(NUMBERED_LAW);
		if (numbered && Number(numbered[1]) === lastNum + 1) {
			lastNum += 1;
			(group as Group).items.push({ num: lastNum, lines: [raw], page });
			continue;
		}

		(group as Group).items.at(-1)!.lines.push(raw);
	}

	finish();
}

/**
 * Adds a subheading's group as one chunk ("Law 14.5–14.7"), or in pieces of about
 * TARGET_WORDS if it's long. A group with no numbered laws is named by its subheading
 * ("Law 14, Principle").
 */
function addGroup(chunks: ParsedChunk[], law: { num: number; title: string }, group: Group) {
	const items = group.items.filter((item) => item.num > 0 || item.lines.length > 0);
	if (items.length === 0) return;
	const lawPath = `Law ${law.num} – ${law.title}`;
	const headingPath = group.subheading ? `${lawPath} > ${group.subheading}` : lawPath;

	const pieces: (typeof items)[] = [];
	const total = wordCount(items.flatMap((item) => item.lines));
	for (const item of items) {
		const piece = pieces.at(-1);
		const fits = piece && (total <= MAX_WORDS || wordCount([...piece.flatMap((it) => it.lines), ...item.lines]) <= TARGET_WORDS);
		if (fits) piece.push(item);
		else pieces.push([item]);
	}

	for (const piece of pieces) {
		const nums = piece.map((item) => item.num).filter((num) => num > 0);
		const ref =
			nums.length === 0
				? `Law ${law.num}, ${group.subheading || 'Introduction'}`
				: nums.length === 1
					? `Law ${law.num}.${nums[0]}`
					: `Law ${law.num}.${nums[0]}–${law.num}.${nums.at(-1)}`;
		add(chunks, { ...openChunk(ref, headingPath, piece[0].page), lines: piece.flatMap((item) => item.lines) });
	}
}

function parseDefinitions(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let current: OpenChunk | null = null;
	const finish = () => {
		if (current) add(chunks, current);
		current = null;
	};

	for (const { raw, page } of lines) {
		if (/^([A-Z]|0-9)$/.test(raw) || raw === 'Definitions') continue; // letter dividers: "A", "B", "0-9"
		const term = raw.match(DEFINITION);
		if (term) {
			finish();
			current = openChunk(`Definition: ${term[1]}`, 'Definitions', page);
			current.lines.push(raw);
			continue;
		}
		if (!current) {
			problems.push({ page, reason: `Definition text before the first term: "${raw.slice(0, 60)}"` });
			continue;
		}
		current.lines.push(raw);
	}
	finish();
}

/**
 * The sevens variations quote the standard (15s) law, then give the sevens version:
 *   "1 Each team has no more than 15 players..." / "Replaced by:" / "1. Each team has no more than seven..."
 * The quoted law is printed without a period after its number, which is the only thing
 * telling the two apart, so it's labeled: "Law 3.1 (15s): Each team has no more than 15...",
 * "In sevens, replaced by:", and "8-13 deleted" becomes "Law 3.8-13: does not apply in sevens".
 */
function parseSevens(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let current: OpenChunk | null = null;
	let law = 0;
	const finish = () => {
		if (current) add(chunks, current);
		current = null;
	};

	for (const { raw, page } of lines) {
		const lawMatch = raw.match(SEVENS_LAW);
		if (lawMatch) {
			finish();
			const title = titleCase(lawMatch[2]).replace(/^./, (letter) => letter.toUpperCase());
			law = Number(lawMatch[1]);
			current = openChunk(`Sevens: Law ${law}`, `Sevens variations > Law ${law} – ${title}`, page);
			continue;
		}
		if (!current) {
			// The opening line: "The laws of the game apply to sevens, subject to the following variations:"
			if (/^The laws of the game apply/.test(raw)) continue;
			problems.push({ page, reason: `Sevens text before the first LAW heading: "${raw.slice(0, 60)}"` });
			continue;
		}

		const deleted = raw.match(/^(\d+[a-z]?(?:-\d+)?) deleted$/);
		const quoted = raw.match(/^(\d+[a-z]?) ([A-Z].*)$/);
		if (deleted) current.lines.push(`Law ${law}.${deleted[1]}: does not apply in sevens`);
		else if (quoted) current.lines.push(`Law ${law}.${quoted[1]} (15s): ${quoted[2]}`);
		else if (raw === 'Replaced by:') current.lines.push('In sevens, replaced by:');
		else if (raw === 'Addition:') current.lines.push('In sevens, added:');
		else current.lines.push(raw);
	}
	finish();
}

/** Joins the chunk's lines, puts the missing punctuation back, and adds it. */
function add(chunks: ParsedChunk[], open: OpenChunk) {
	const lines = joinHyphenatedLines(open.lines);
	const before = chunks.length;
	addSharedChunk(chunks, { ...open, lines }, 'rule', STARTS_NEW_LINE);
	if (chunks.length > before) {
		const chunk = chunks[chunks.length - 1];
		chunk.text = restorePunctuation(chunk.text);
	}
}

// A sentence break isn't added after these words: "...approved by World Rugby".
const MID_PHRASE = new Set([
	'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'see', 'under', 'than', 'their', 'is'
]);
// Capitalized words that appear mid-sentence, so a capital after them isn't a new sentence.
const MID_SENTENCE_WORDS = /^(World|Rugby|Law|Laws|Regulation|Referee|Assistant|Touch|Judge|Game-On|Variation|Sevens|Under-19|Television|Match|Official|Definitions?)\b/;

/**
 * Puts back what the PDF's text layer dropped:
 *   "Law 9 13" -> "Law 9.13", "Laws 9 13, 14 5a" -> "Laws 9.13, 14.5a"
 *   "...the touchlines It includes..." -> "...the touchlines. It includes..."
 */
export function restorePunctuation(text: string): string {
	let fixed = text.replace(/\b([Ll]aws? )(\d{1,2}) (\d{1,2}[a-z]?)\b/g, '$1$2.$3');
	// Further references in a list after a fixed one: ", 14 5a" / " or 3 20".
	let previous = '';
	while (previous !== fixed) {
		previous = fixed;
		fixed = fixed.replace(/(\d+\.\d+[a-z]?(?:, | and | or ))(\d{1,2}) (\d{1,2}[a-z]?)\b/g, '$1$2.$3');
	}

	return fixed
		.split('\n')
		.map((line) =>
			line.replace(/(\S+) (?=([A-Z][a-z]\S*|A |I ))/g, (match, word: string, next: string) => {
				const endsSentence = /[a-z0-9)’']$/.test(word) && !MID_PHRASE.has(word.toLowerCase()) && !MID_SENTENCE_WORDS.test(next);
				// The start of a line ("1. For a tackle") or a label ("Sanction: Penalty") is left alone.
				return endsSentence && !/^(\d+\.|[a-z]\.|[ivx]+\.)$/.test(word) && !/:$/.test(word) ? `${word}. ` : match;
			})
		)
		.join('\n')
		.replace(/([a-z0-9)’'])$/gm, '$1.')
		.replace(/:\.$/gm, ':');
}

function wordCount(lines: string[]): number {
	return lines.join(' ').split(/\s+/).length;
}
