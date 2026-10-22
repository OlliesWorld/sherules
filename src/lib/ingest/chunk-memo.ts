import { addChunk as addSharedChunk, collectLines, isAllCaps, openChunk, type OpenChunk } from './pdf-lines.ts';
import type { PageProblem, ParsedChunk, ParseResult, Source } from './types.ts';

// Chunker for short rules memos (e.g. NCAA women's ice hockey interpretations):
//   MEMORANDUM / TO: / FROM: / SUBJECT: ...   memo header, skipped
//   1. Timeouts in no-change situations.      numbered ruling  <- one chunk each:
//   • Situation: ...                              "Interpretation 1 – Timeouts in no-change situations"
//   • Ruling: ...
//   SP:pa / cc: ...                            sign-off, skipped
//
// A range with a `title` is a one-topic memo (e.g. an experimental rule): one chunk, named by the
// title. It keeps the memo's all-caps heading ("2026-27 SEASON – FOR CONFERENCE PLAY ONLY") and the
// rule from its topic heading on ("Unlimited High Sticking:"), and skips the process text between
// (who to contact, data collection), which buries the rule when searching.

const NUMBERED_ITEM = /^(\d+)\. (.+?)\.?$/;
// Repeated at the top of later pages: memo title, date, "Page No. 2", a rule line.
const PAGE_FURNITURE = /^(Page No\. \d+|_+|NCAA .* Rules Interpretations|[A-Z][a-z]+ \d{1,2}, \d{4})$/;
const SIGN_OFF = /^([A-Z]{2}:[a-z]{2}|cc:)/;
// A one-topic memo's topic, on its own line: "Unlimited High Sticking:".
const TOPIC_HEADING = /^[A-Z][^.:]{2,60}:$/;

const STARTS_NEW_LINE = /^(•|Note:|\d+\.\s)/;

export function parseMemo(pages: string[], source: Source): ParseResult {
	const chunks: ParsedChunk[] = [];
	const problems: PageProblem[] = [];
	const add = (open: OpenChunk, type: ParsedChunk['type']) => addSharedChunk(chunks, open, type, STARTS_NEW_LINE);

	for (const range of source.ranges) {
		const lines = collectLines(pages, range, source, problems, (line) => PAGE_FURNITURE.test(line));

		if (range.title) {
			const memo = openChunk(range.title, range.title, range.from);
			const heading = lines.filter((line, i) => i < 3 && isAllCaps(line.raw)).map((line) => line.raw);
			const topicStart = lines.findIndex((line) => TOPIC_HEADING.test(line.raw));
			if (topicStart === -1) problems.push({ page: range.from, reason: 'No topic heading found, kept the whole memo' });
			memo.lines = [...heading, ...lines.slice(topicStart === -1 ? heading.length : topicStart).map((line) => line.raw)];
			add(memo, range.type);
			continue;
		}

		let current: OpenChunk | null = null;
		let lastNum = 0;
		for (const { raw, page } of lines) {
			if (SIGN_OFF.test(raw)) break;
			const item = raw.match(NUMBERED_ITEM);
			if (item && Number(item[1]) === lastNum + 1) {
				if (current) add(current, range.type);
				lastNum += 1;
				current = openChunk(`Interpretation ${lastNum} – ${item[2]}`, source.name, page);
				continue;
			}
			// Before the first ruling: the memo header and introduction.
			if (current) current.lines.push(raw);
		}
		if (current) add(current, range.type);
		if (lastNum === 0) problems.push({ page: range.from, reason: 'No numbered rulings found' });
	}

	return { chunks, problems };
}
