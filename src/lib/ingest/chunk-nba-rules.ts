import {
	addChunk as addSharedChunk,
	collectLines,
	isAllCaps,
	openChunk,
	rulePath,
	titleCase,
	type Line,
	type OpenChunk
} from './pdf-lines.ts';
import type { PageProblem, ParsedChunk, ParseResult, Source } from './types.ts';

// Chunker for rulebooks in the NBA layout (e.g. the WNBA's Official Rules):
//   RULE NO. 1—COURT DIMENSIONS—EQUIPMENT   rule
//   A. Technical Foul                        part (only Rule 12: 12A and 12B, as the book cites them)
//   Section I—Court and Dimensions           section  <- one chunk per section
//   a. The playing court shall be ...        lettered item
//   (1) ...                                  numbered sub-item
//   A—Mandatory/Team                         subpart inside a section; lettering restarts under it
//
// Most sections are a few hundred words, but some run for pages (Rule 13, Section II is
// ~3,000 words). Those are split at their lettered items into ~500-word pieces, labeled
// the way the book cites them: "Rule 13, Section II, a–c".
//
// The "Comments on the Rules" range is the league's official guidance, one chunk per topic:
//   I. GUIDES FOR ADMINISTRATION ...   /   II. BASIC PRINCIPLES   /   A. CONTACT SITUATIONS

const RULE_HEADING = /^RULE NO\. (\d+)—(.+)$/;
const PART_HEADING = /^([A-Z])\. ([A-Z][a-z].*)$/;
const SECTION_HEADING = /^Section ([IVXL]+)\s*—\s*(.+)$/;
// A subheading inside a section, where lettering restarts: "A—Mandatory/Team" or "A. Free Throws".
const SUBPART = /^([A-Z])(?:—|\. [A-Z][a-z])/;
const LETTERED_ITEM = /^([a-z])\.\s/;
const COMMENT_HEADING = /^([IVX]+|[A-Z])\. ([A-Z][A-Z ,:'’—/-]+)$/;
const COMMENTS_HEADING = 'COMMENTS ON THE RULES';

// Repeated on every page: the page number as "-12-" and an "Official Rules" header.
const PAGE_FURNITURE = /^(-\d+-|Official Rules)$/;

// When rejoining wrapped lines, these start a new line: lettered and numbered items,
// subparts, exceptions, notes and penalties.
const STARTS_NEW_LINE = /^([a-z]\.\s|\(\d+\)\s|[A-Z]—|[A-Z]\. [A-Z][a-z]|EXCEPTION|NOTE|Note|PENALTY|•)/;

// Sections longer than this are split; pieces aim for about TARGET_WORDS.
const MAX_WORDS = 600;
const TARGET_WORDS = 500;

/** An open chunk that also remembers which page each line came from, for split pieces. */
interface SectionChunk extends OpenChunk {
	linePages: number[];
}

export function parseNbaRules(pages: string[], source: Source): ParseResult {
	const chunks: ParsedChunk[] = [];
	const problems: PageProblem[] = [];
	const isPageFurniture = (line: string) => PAGE_FURNITURE.test(line);

	for (const range of source.ranges) {
		const lines = collectLines(pages, range, source, problems, isPageFurniture);
		// The last rule and the Comments share a page, so the split is at the heading line,
		// not the page boundary: rules stop before it, comments start after it.
		const commentsStart = lines.findIndex((line) => line.raw === COMMENTS_HEADING);
		if (range.type === 'interpretation') {
			parseComments(commentsStart === -1 ? lines : lines.slice(commentsStart + 1), chunks, problems);
		} else {
			parseRules(commentsStart === -1 ? lines : lines.slice(0, commentsStart), chunks, problems);
		}
	}

	return { chunks, problems };
}

function parseRules(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let rule: { num: number; title: string } | null = null;
	let part = ''; // "A" or "B" inside Rule 12, so refs read "Rule 12A"
	let lastSection = 0;
	let current: SectionChunk | null = null;

	const finish = () => {
		if (current) addSection(chunks, current);
		current = null;
	};
	const ruleRef = () => `Rule ${rule!.num}${part}`;
	const open = (ref: string, path: string, page: number): SectionChunk => ({ ...openChunk(ref, path, page), linePages: [] });

	for (let i = 0; i < lines.length; i++) {
		const { raw, page } = lines[i];

		const ruleMatch = raw.match(RULE_HEADING);
		if (ruleMatch) {
			finish();
			const num = Number(ruleMatch[1]);
			if (rule && num !== rule.num + 1) {
				problems.push({ page, reason: `Rule ${num} follows Rule ${rule.num}, a rule heading may be missing` });
			}
			rule = { num, title: titleCase(ruleMatch[2]) };
			part = '';
			lastSection = 0;
			// Text before the first section becomes the rule's own chunk.
			current = open(ruleRef(), rulePath(rule), page);
			continue;
		}

		if (!rule) {
			problems.push({ page, reason: `Text before the first RULE heading: "${raw.slice(0, 60)}"` });
			continue;
		}

		// A part heading ("B. Personal Foul") is followed straight away by its Section I.
		// Short lettered lines inside a section ("A. Free Throws" in Rule 2, Section VI)
		// aren't, so they stay in the section as subheadings.
		const partMatch = raw.match(PART_HEADING);
		const nextIsSection = SECTION_HEADING.test(lines[i + 1]?.raw ?? '');
		if (partMatch && nextIsSection) {
			finish();
			part = partMatch[1];
			lastSection = 0;
			current = open(ruleRef(), `${rulePath(rule)} > ${part}. ${partMatch[2]}`, page);
			continue;
		}

		const sectionMatch = raw.match(SECTION_HEADING);
		if (sectionMatch) {
			finish();
			const num = romanToNumber(sectionMatch[1]);
			if (num !== lastSection + 1) {
				problems.push({ page, reason: `${ruleRef()} Section ${sectionMatch[1]} found, expected section ${lastSection + 1}` });
			}
			lastSection = num;
			const partPath = part ? ` > ${part}` : '';
			current = open(
				`${ruleRef()}, Section ${sectionMatch[1]}`,
				`${rulePath(rule)}${partPath} > Section ${sectionMatch[1]}—${sectionMatch[2].trim()}`,
				page
			);
			continue;
		}

		if (!current) {
			problems.push({ page, reason: `Text outside any section in ${ruleRef()}: "${raw.slice(0, 60)}"` });
			continue;
		}

		current.lines.push(raw);
		current.linePages.push(page);
	}

	finish();
}

/** Adds a section as one chunk, or as several pieces if it's long. */
function addSection(chunks: ParsedChunk[], section: SectionChunk) {
	const words = section.lines.join(' ').split(/\s+/).length;
	if (words <= MAX_WORDS) {
		addSharedChunk(chunks, section, 'rule', STARTS_NEW_LINE);
		return;
	}
	for (const piece of splitAtLetteredItems(section)) {
		addSharedChunk(chunks, piece, 'rule', STARTS_NEW_LINE);
	}
}

/**
 * Splits a long section into pieces of roughly TARGET_WORDS, only ever breaking before a
 * lettered item ("a.", "b.") or a subpart ("B—Reset"), never in the middle of an item.
 * Each piece is labeled with the items it holds: "Rule 13, Section II, a–c".
 */
function splitAtLetteredItems(section: SectionChunk): OpenChunk[] {
	// Group the lines into items. Text before the first item stays with it.
	interface Item { subpart: string; letter: string; lines: string[]; page: number; words: number }
	const items: Item[] = [];
	let subpart = '';
	let nextLetter = 'a';
	section.lines.forEach((line, i) => {
		const page = section.linePages[i];
		const subpartMatch = line.match(SUBPART);
		if (subpartMatch) {
			subpart = subpartMatch[1];
			nextLetter = 'a'; // lettering restarts under each subpart
		}
		// Only the next letter in sequence starts an item. A small Roman-numeral list inside
		// an item ("i.", "v.") would otherwise look like items "i" and "v".
		const letterMatch = line.match(LETTERED_ITEM);
		const isNextItem = letterMatch?.[1] === nextLetter;
		if (isNextItem) nextLetter = String.fromCharCode(nextLetter.charCodeAt(0) + 1);

		if (isNextItem || subpartMatch || items.length === 0) {
			items.push({ subpart, letter: isNextItem ? letterMatch[1] : '', lines: [], page, words: 0 });
		}
		const item = items[items.length - 1];
		item.lines.push(line);
		item.words += line.split(/\s+/).length;
	});

	// Fill pieces up to the target size, starting a new piece at each subpart change.
	const pieces: Item[][] = [];
	for (const item of items) {
		const piece = pieces.at(-1);
		const pieceWords = piece?.reduce((sum, it) => sum + it.words, 0) ?? 0;
		const sameSubpart = piece && piece[0].subpart === item.subpart;
		if (piece && sameSubpart && pieceWords + item.words <= TARGET_WORDS) piece.push(item);
		else pieces.push([item]);
	}

	return pieces.map((piece) => {
		// "a–c" for several items, "e" for one, nothing for a subpart without lettered items.
		const letters = piece.map((it) => it.letter).filter(Boolean);
		const range = letters.length > 1 ? `, ${letters[0]}–${letters.at(-1)}` : letters.length === 1 ? `, ${letters[0]}` : '';
		const subpartLabel = piece[0].subpart ? `-${piece[0].subpart}` : '';
		return {
			...openChunk(`${section.ruleRef}${subpartLabel}${range}`, section.headingPath, piece[0].page),
			lines: piece.flatMap((it) => it.lines)
		};
	});
}

function parseComments(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let group = ''; // "II. Basic Principles", the heading over the lettered topics
	let seenLetterA = false;
	let current: OpenChunk | null = null;
	// The current topic's label and all-caps title as printed, kept so a title that wraps
	// onto a second line can be re-cased as a whole.
	let topic = { label: '', rawTitle: '' };

	const finish = () => {
		if (current) addSharedChunk(chunks, current, 'interpretation', STARTS_NEW_LINE);
		current = null;
	};

	// Names the open topic chunk from its label and (possibly wrapped) title.
	const nameTopic = (chunk: OpenChunk) => {
		const title = titleCase(topic.rawTitle);
		chunk.ruleRef = `Comment ${topic.label}. ${title}`;
		const groupPath = group ? ` > ${group}` : '';
		chunk.headingPath = `Comments on the Rules${groupPath} > ${topic.label}. ${title}`;
	};

	for (const { raw, page } of lines) {
		const headingMatch = raw.match(COMMENT_HEADING);
		if (headingMatch) {
			const label = headingMatch[1];
			if (label === 'A') seenLetterA = true;
			// Before topic A, "I." and "II." are Roman-numeral parts; after it, "I." is topic I.
			const isPart = !seenLetterA && (label === 'I' || label === 'II');
			finish();
			if (isPart && label === 'II') {
				// "II. BASIC PRINCIPLES" only introduces the lettered topics.
				group = `${label}. ${titleCase(headingMatch[2])}`;
				continue;
			}
			topic = { label, rawTitle: headingMatch[2] };
			current = openChunk('', '', page);
			nameTopic(current);
			continue;
		}

		// A heading that wraps onto a second all-caps line ("...APPLICATION OF" / "THE RULES").
		if (current && current.lines.length === 0 && isAllCaps(raw)) {
			topic.rawTitle += ` ${raw}`;
			nameTopic(current);
			continue;
		}

		if (!current) {
			problems.push({ page, reason: `Comments text outside any topic: "${raw.slice(0, 60)}"` });
			continue;
		}

		current.lines.push(raw);
	}

	finish();
}

function romanToNumber(roman: string): number {
	const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
	let total = 0;
	for (let i = 0; i < roman.length; i++) {
		const value = values[roman[i]];
		const next = values[roman[i + 1]] ?? 0;
		total += value < next ? -value : value;
	}
	return total;
}
