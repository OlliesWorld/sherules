import { addChunk as addSharedChunk, collectLines, openChunk, type Line, type OpenChunk } from './pdf-lines.ts';
import type { PageProblem, ParsedChunk, ParseResult, Source } from './types.ts';

// Chunker for short league documents organized under all-caps headings (e.g. the NWSL
// Competition Rules & Regulations):
//   CAUTIONS AND SUSPENSIONS:          heading  <- one chunk per heading: "Cautions and Suspensions"
//   A Player will be suspended ...     text, with ● bullets
//   GAME DELAYS, POSTPONEMENT, AND CANCELLATION
//   PROTOCOL TO DELAY, POSTPONE ...    a heading straight after another: the first is a group
//
// Long policies (the heat safety policy runs for pages) are split at their lettered parts:
//   A. WBGT. The Wet Bulb Globe ...    -> "NWSL Game Day Heat Safety Policy, A. WBGT"

// All caps, optionally ending in a colon or a note in parentheses: "TIME-LIMITED ... (effective June 26, 2026)".
const HEADING = /^([A-Z][A-Z0-9 &/,'’-]+?)\s*(\([^)]*\))?:?$/;
// "A. WBGT. The Wet Bulb..." or "C. Game Delay / Continuation. The game shall..."
const LETTERED_PART = /^([A-Z])\. ([A-Z][^.]{0,60})\./;
// A titled item inside a part: "3. Measurements. If WBGT..." or "a. First Measurement."
const TITLED_ITEM = /^(\d+|[a-z])\. ([A-Z][A-Za-z /]{0,40})\./;
// Acronyms that stay in capitals when a heading is title-cased.
const ACRONYMS = new Set(['NWSL', 'WBGT', 'PRO', 'IRP', 'VAR']);
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);

const STARTS_NEW_LINE = /^(•|[A-Z]\.\s|[a-z]\.\s|[ivx]+\.\s|\d+\.\s|NOTE:|Notes on|Players:|Technical Staff:)/;

const MAX_WORDS = 600;
const TARGET_WORDS = 500;
// A heading with no more text than this ("NWSL PLAYOFFS:" / "Single-Elimination Format")
// is a group heading over the next one, and its text joins the next heading's chunk.
const GROUP_MAX_WORDS = 3;

/** A heading's text while it's being read, split into its lettered parts if it has any. */
interface OpenHeading {
	title: string;
	headingPath: string;
	page: number;
	parts: { label: string; lines: string[]; page: number }[];
}

export function parseCapsHeadings(pages: string[], source: Source): ParseResult {
	const chunks: ParsedChunk[] = [];
	const problems: PageProblem[] = [];

	for (const range of source.ranges) {
		parseHeadings(collectLines(pages, range, source, problems), source, chunks, problems);
	}

	return { chunks, problems };
}

function parseHeadings(lines: Line[], source: Source, chunks: ParsedChunk[], problems: PageProblem[]) {
	let group = '';
	let current: OpenHeading | null = null;

	const finish = () => {
		if (current) addHeading(chunks, current);
		current = null;
	};

	for (const { raw, page } of lines) {
		const line = raw.replace(/^●\s*/, '• ');
		const headingMatch = line.match(HEADING);
		if (headingMatch && /[A-Z]{3}/.test(headingMatch[1])) {
			const title = headingCase(headingMatch[1]);
			// A heading with (almost) nothing under it is a group heading over this one.
			const groupLines: string[] = current ? current.parts.flatMap((part) => part.lines) : [];
			const isGroup: boolean = current !== null && groupLines.join(' ').split(/\s+/).filter(Boolean).length <= GROUP_MAX_WORDS;
			if (isGroup) {
				group = current!.title;
			} else {
				finish();
				group = '';
			}
			const note = headingMatch[2] ? ` ${headingMatch[2]}` : '';
			current = {
				title,
				headingPath: `${source.name} > ${group ? `${group} > ` : ''}${title}${note}`,
				page,
				parts: [{ label: '', lines: isGroup ? groupLines : [], page }]
			};
			continue;
		}

		if (!current) {
			problems.push({ page, reason: `Text before the first heading: "${line.slice(0, 60)}"` });
			continue;
		}

		const partMatch = line.match(LETTERED_PART);
		if (partMatch) current.parts.push({ label: `${partMatch[1]}. ${partMatch[2]}`, lines: [], page });
		current.parts.at(-1)!.lines.push(line);
	}

	finish();
}

/**
 * Adds a heading as one chunk, or one chunk per lettered part if it's long. A part that's
 * still long is split again at its titled items, labeled with the first one in each piece:
 * "NWSL Game Day Heat Safety Policy, B. Game Day Measurements (3. Measurements)".
 */
function addHeading(chunks: ParsedChunk[], heading: OpenHeading) {
	const add = (open: OpenChunk) => addSharedChunk(chunks, open, 'rule', STARTS_NEW_LINE);
	const allLines = heading.parts.flatMap((part) => part.lines);

	if (wordCount(allLines) <= MAX_WORDS || heading.parts.length === 1) {
		add({ ...openChunk(heading.title, heading.headingPath, heading.page), lines: allLines });
		return;
	}
	for (const part of heading.parts) {
		const ref = part.label ? `${heading.title}, ${part.label}` : heading.title;
		if (wordCount(part.lines) <= MAX_WORDS) {
			add({ ...openChunk(ref, heading.headingPath, part.page), lines: part.lines });
			continue;
		}
		splitAtTitledItems(part.lines).forEach((piece, i) => {
			const label = i > 0 ? ` (${piece.title})` : '';
			add({ ...openChunk(ref + label, heading.headingPath, part.page), lines: piece.lines });
		});
	}
}

/** Groups lines into pieces of about TARGET_WORDS, breaking only before a titled item. */
function splitAtTitledItems(lines: string[]): { title: string; lines: string[] }[] {
	const pieces: { title: string; lines: string[] }[] = [];
	for (const line of lines) {
		const item = line.match(TITLED_ITEM);
		const piece = pieces.at(-1);
		if (!piece || (item && wordCount(piece.lines) + wordCount([line]) > TARGET_WORDS)) {
			pieces.push({ title: item ? `${item[1]}. ${item[2]}` : '', lines: [line] });
		} else {
			piece.lines.push(line);
		}
	}
	return pieces;
}

function wordCount(lines: string[]): number {
	return lines.join(' ').split(/\s+/).length;
}

/** "NWSL GAME DAY HEAT SAFETY POLICY" -> "NWSL Game Day Heat Safety Policy". */
function headingCase(text: string): string {
	return text
		.toLowerCase()
		.split(' ')
		.map((word, i) => {
			if (ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
			if (i > 0 && SMALL_WORDS.has(word)) return word;
			return word.replace(/(^|[-/])([a-z])/g, (_, joiner: string, letter: string) => joiner + letter.toUpperCase());
		})
		.join(' ');
}
