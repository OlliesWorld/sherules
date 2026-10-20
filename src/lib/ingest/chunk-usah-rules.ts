import { addChunk as addSharedChunk, collectLines, openChunk, titleCase, type Line, type OpenChunk } from './pdf-lines.ts';
import type { PageProblem, ParsedChunk, ParseResult, Source } from './types.ts';

// Chunker for USA Hockey's Official Rules and Casebook of Ice Hockey. Each section is its
// rules followed by its casebook:
//   SECTION FOUR / PENALTIES             section
//   Rule 401 Penalties                   rule  <- one chunk per rule: "Rule 401"
//   (a) A player shall ...               lettered item (long rules split here: "Rule 401(c)–(e)")
//   (Note) ...
//   ...
//   Rule 401 Penalties                   the casebook starts: the rule numbers go back to the start
//   a Situation 7                        case  <- one chunk per case: "Rule 401, Situation 7"
//   A player (Youth, Girls’ or High School) ... Two. Rule Reference 401(b). ...
//
// Every page opens with a running header ("Dimensions of Rink The Rink" /
// "2025-29 Official Rules and Casebook of Ice Hockey 3"), which is cut off first.
//
// The glossary range (layout 'definitions') has a term on its own line, then its definition.

// The last line of a page's running header: "...Casebook of Ice Hockey 3", "98 USA Hockey",
// "CASEBOOK – TEAMS32 USA Hockey", "Casebook – Teams2025-29 Official Rules and Casebook of Ice Hockey 35CASEBOOK".
const HEADER_END = /Official Rules and Casebook of Ice Hockey \d+|USA Hockey$/;
const FURNITURE = /^(CASEBOOK.*|Casebook – .*|APPENDIX [IVX]+|GLOSSARY)$/;

const SECTION_HEADING = /^SECTION ([A-Z]+)$/;
const RULE_HEADING = /^Rule (\d{3}) ([A-Z][^.]*)$/;
// "a" is the book's bullet glyph: "a Situation 7", "a NEW – Situation 2", "a Situation 11 (For Adults Only)".
// The qualifier can wrap onto the next line: "a Situation 11 (Age Classifications with Delayed/Tag-Up".
const SITUATION = /^a (?:NEW – )?Situation (\d+)(?: (\(.*))?$/;
const NO_SITUATIONS = 'a No situations.';
// Each section numbers its rules in its own hundreds: Section Four is Rules 401-4xx.
const SECTION_NUMBERS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6 };
const LETTERED_ITEM = /^\(([a-z])\) /;

const STARTS_NEW_LINE = /^(\([a-z]\)\s|\(\d+\)\s|\(Note|Note|PENALTY|•|\d+\.\s)/;
const MAX_WORDS = 600;
const TARGET_WORDS = 500;

interface RuleChunk extends OpenChunk {
	linePages: number[];
}

export function parseUsahRules(pages: string[], source: Source): ParseResult {
	const chunks: ParsedChunk[] = [];
	const problems: PageProblem[] = [];
	const withoutHeaders = pages.map(stripRunningHeader);

	for (const range of source.ranges) {
		const lines = collectLines(withoutHeaders, range, source, problems, (line) => FURNITURE.test(line));
		if (range.layout === 'definitions') parseGlossary(lines, chunks);
		else parseRulesAndCases(lines, chunks, problems);
	}

	return { chunks, problems };
}

/** Cuts a page's running header: everything up to its "...Casebook of Ice Hockey 3" line. */
function stripRunningHeader(page: string): string {
	const lines = page.split('\n');
	const end = lines.slice(0, 4).findIndex((line) => HEADER_END.test(line.trim()));
	return end === -1 ? page : lines.slice(end + 1).join('\n');
}

function parseRulesAndCases(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let section = '';
	let sectionNum = 0;
	let readingSectionTitle = false;
	// Right after a rule heading, whose title can wrap: "Rule 602 Attempt to Injure or Recklessly Endanger" / "an Opponent".
	let afterRuleHeading = false;
	let inCasebook = false;
	let lastRule = 0;
	let caseRule = { num: 0, title: '' };
	let lastSituation = 0;
	let current: RuleChunk | null = null;

	const finish = () => {
		if (current) addLong(chunks, current, current.ruleRef.includes('Situation') ? 'interpretation' : 'rule');
		current = null;
	};
	const open = (ref: string, path: string, page: number): RuleChunk => ({ ...openChunk(ref, path, page), linePages: [] });

	for (const { raw, page } of lines) {
		const sectionMatch = raw.match(SECTION_HEADING);
		if (sectionMatch) {
			finish();
			section = `Section ${titleCase(sectionMatch[1])}`;
			sectionNum = SECTION_NUMBERS[sectionMatch[1]] ?? 0;
			readingSectionTitle = true;
			inCasebook = false;
			lastRule = 0;
			continue;
		}
		if (readingSectionTitle) {
			section += ` – ${titleCase(raw)}`;
			readingSectionTitle = false;
			continue;
		}

		if (afterRuleHeading && /^[a-z]/.test(raw) && !SITUATION.test(raw) && raw !== NO_SITUATIONS) {
			if (inCasebook) caseRule.title += ` ${raw}`;
			else if (current) current.headingPath += ` ${raw}`;
			continue;
		}
		afterRuleHeading = false;

		// A heading is a rule of this section; lines in a summary table can start with
		// another section's rule ("Rule 640 Unnecessary Roughness" inside Section Four).
		const ruleMatch = raw.match(RULE_HEADING);
		const num = Number(ruleMatch?.[1]);
		if (ruleMatch && Math.floor(num / 100) === sectionNum && ruleMatch[2].split(' ').length <= 10) {
			finish();
			afterRuleHeading = true;
			// The casebook goes back through the section's rules from the start.
			if (!inCasebook && num <= lastRule) inCasebook = true;
			if (inCasebook) {
				caseRule = { num, title: ruleMatch[2] };
				lastSituation = 0;
			} else {
				if (lastRule && num !== lastRule + 1) problems.push({ page, reason: `Rule ${num} follows Rule ${lastRule}` });
				lastRule = num;
				current = open(`Rule ${num}`, `${section} > Rule ${num} – ${ruleMatch[2]}`, page);
			}
			continue;
		}

		const situation = raw.match(SITUATION);
		if (situation && inCasebook) {
			finish();
			const situationNum = Number(situation[1]);
			if (situationNum !== lastSituation + 1) {
				problems.push({ page, reason: `Rule ${caseRule.num} Situation ${situationNum} follows ${lastSituation}` });
			}
			lastSituation = situationNum;
			current = open(
				`Rule ${caseRule.num}, Situation ${situationNum}`,
				`${section} > Casebook > Rule ${caseRule.num} – ${caseRule.title}`,
				page
			);
			if (situation[2]) current.lines.push(situation[2]); // "(For Adults Only)"
			continue;
		}

		if (raw === NO_SITUATIONS) continue;

		if (!current) {
			problems.push({ page, reason: `Text outside any rule or case: "${raw.slice(0, 60)}"` });
			continue;
		}
		current.lines.push(raw);
		current.linePages.push(page);
	}

	finish();
}

/**
 * Adds a rule or case as one chunk, or as ~500-word pieces if it's long. Pieces break before
 * a lettered item, or where a new sentence starts a line, and are labeled by their items:
 * "Rule 604(c)–(f)", or "(part 2)" when they hold none.
 */
function addLong(chunks: ParsedChunk[], rule: RuleChunk, type: ParsedChunk['type']) {
	const add = (open: OpenChunk) => addSharedChunk(chunks, open, type, STARTS_NEW_LINE);
	if (wordCount(rule.lines) <= MAX_WORDS) {
		add(rule);
		return;
	}

	const pieces: { letters: string[]; lines: string[]; page: number }[] = [];
	rule.lines.forEach((line, i) => {
		const letter = line.match(LETTERED_ITEM)?.[1];
		const piece = pieces.at(-1);
		const canSplit = letter || (/\.$/.test(rule.lines[i - 1] ?? '') && /^[A-Z(]/.test(line));
		if (!piece || (canSplit && wordCount(piece.lines) + wordCount([line]) > TARGET_WORDS)) {
			pieces.push({ letters: [], lines: [], page: rule.linePages[i] });
		}
		const current = pieces.at(-1)!;
		if (letter) current.letters.push(letter);
		current.lines.push(line);
	});

	pieces.forEach((piece, i) => {
		const [first, last] = [piece.letters[0], piece.letters.at(-1)];
		const range = !first ? ` (part ${i + 1})` : first === last ? `(${first})` : `(${first})–(${last})`;
		// The first piece keeps the plain ref if it starts before the first lettered item.
		const ref = i === 0 && !LETTERED_ITEM.test(piece.lines[0]) ? rule.ruleRef : rule.ruleRef + range;
		add({ ...openChunk(ref, rule.headingPath, piece.page), lines: piece.lines });
	});
}

/** Glossary: a term alone on a short line, then its definition. */
function parseGlossary(lines: Line[], chunks: ParsedChunk[]) {
	let current: OpenChunk | null = null;
	const finish = () => {
		if (current) addSharedChunk(chunks, current, 'rule', STARTS_NEW_LINE);
		current = null;
	};

	lines.forEach(({ raw, page }, i) => {
		const previous = lines[i - 1]?.raw ?? '';
		const isTerm =
			raw.split(' ').length <= 6 &&
			/^[A-Z]/.test(raw) &&
			!/[.,;:]$/.test(raw) &&
			(i === 0 || /[.:)]$/.test(previous));
		if (isTerm) {
			finish();
			current = openChunk(`Glossary: ${raw}`, 'Glossary', page);
			current.lines.push(`${raw}:`);
			return;
		}
		current?.lines.push(raw);
	});
	finish();
}

function wordCount(lines: string[]): number {
	return lines.join(' ').split(/\s+/).length;
}
