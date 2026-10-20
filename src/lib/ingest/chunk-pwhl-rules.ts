import { addChunk as addSharedChunk, collectLines, openChunk, titleCase, type Line, type OpenChunk } from './pdf-lines.ts';
import type { PageProblem, ParsedChunk, ParseResult, Source } from './types.ts';

// Chunker for the PWHL Official Rule Book (NHL-style layout):
//   SECTION 4: TYPES OF PENALTIES          section (also repeated as a running header)
//   Rule 24 Penalty Shot                   rule
//   24.3 Designated Player                 article heading, on its own line  <- one chunk each: "Rule 24.3"
//   In cases where a penalty shot ...     text
//
// Text lines can start with a rule number too ("Rule 20 – Major penalties..."), so a heading
// must also be next in sequence and short, with no closing period.
//
// Long articles are split at paragraph boundaries into ~500-word pieces: "Rule 38.4 (part 2)".

const SECTION_HEADING = /^SECTION (\d+): (.+)$/;
const RULE_HEADING = /^Rule (\d+) ([A-Z][^.]*)$/;
const ARTICLE_HEADING = /^(\d+)\.(\d+) ([A-Z“"(].*)$/;
// "PWHL Official Rule Book 2025 – 2026 41" (the page number is sometimes missing).
const RUNNING_HEADER = /^PWHL Official Rule Book \d{4} – \d{4}( [\divx]+)?$/;
const MAX_GAP = 3;

const STARTS_NEW_LINE = /^(\([ivx]+\)\s|\([a-z]\)\s|\(\d+\)\s|[a-z]\.\s|\d+\.\s|•|Note|NOTE|Exception|PENALTY)/;
const MAX_WORDS = 600;
const TARGET_WORDS = 500;

interface ArticleChunk extends OpenChunk {
	linePages: number[];
}

export function parsePwhlRules(pages: string[], source: Source): ParseResult {
	const chunks: ParsedChunk[] = [];
	const problems: PageProblem[] = [];

	for (const range of source.ranges) {
		const lines = collectLines(pages, range, source, problems, (line) => RUNNING_HEADER.test(line));
		parseRules(lines, chunks, problems);
	}

	return { chunks, problems };
}

function parseRules(lines: Line[], chunks: ParsedChunk[], problems: PageProblem[]) {
	let section = '';
	let rule: { num: number; title: string } | null = null;
	let lastArticle = 0;
	let current: ArticleChunk | null = null;

	const finish = () => {
		if (current) addArticle(chunks, current);
		current = null;
	};
	const open = (ref: string, path: string, page: number): ArticleChunk => ({ ...openChunk(ref, path, page), linePages: [] });
	const isHeading = (title: string) => title.split(' ').length <= 14 && !/[.:;,]$/.test(title);

	for (const { raw, page } of lines) {
		// The section name also repeats at the top of every page; either way it names the section.
		const sectionMatch = raw.match(SECTION_HEADING);
		if (sectionMatch) {
			section = `Section ${sectionMatch[1]} – ${titleCase(sectionMatch[2])}`;
			continue;
		}

		const ruleMatch = raw.match(RULE_HEADING);
		const ruleNum = Number(ruleMatch?.[1]);
		const lastRule: number = rule?.num ?? 0;
		if (ruleMatch && ruleNum > lastRule && ruleNum <= lastRule + MAX_GAP && isHeading(ruleMatch[2])) {
			finish();
			if (ruleNum !== lastRule + 1) problems.push({ page, reason: `Rule ${ruleNum} follows Rule ${lastRule}` });
			rule = { num: ruleNum, title: ruleMatch[2].trim() };
			lastArticle = 0;
			current = open(`Rule ${ruleNum}`, `${section} > Rule ${ruleNum} – ${rule.title}`, page);
			continue;
		}

		const articleMatch = raw.match(ARTICLE_HEADING);
		const articleNum = Number(articleMatch?.[2]);
		if (
			articleMatch &&
			rule &&
			Number(articleMatch[1]) === rule.num &&
			articleNum > lastArticle &&
			articleNum <= lastArticle + MAX_GAP &&
			isHeading(articleMatch[3])
		) {
			finish();
			if (articleNum !== lastArticle + 1) problems.push({ page, reason: `Article ${rule.num}.${articleNum} follows ${rule.num}.${lastArticle}` });
			lastArticle = articleNum;
			current = open(
				`Rule ${rule.num}.${articleNum}`,
				`${section} > Rule ${rule.num} – ${rule.title} > ${rule.num}.${articleNum} ${articleMatch[3]}`,
				page
			);
			continue;
		}

		if (!current) {
			problems.push({ page, reason: `Text before the first rule: "${raw.slice(0, 60)}"` });
			continue;
		}
		current.lines.push(raw);
		current.linePages.push(page);
	}

	finish();
}

/** Adds an article as one chunk, or as ~500-word pieces split where a new paragraph or item starts. */
function addArticle(chunks: ParsedChunk[], article: ArticleChunk) {
	const add = (open: OpenChunk) => addSharedChunk(chunks, open, 'rule', STARTS_NEW_LINE);
	if (wordCount(article.lines) <= MAX_WORDS) {
		add(article);
		return;
	}

	const pieces: { lines: string[]; page: number }[] = [];
	article.lines.forEach((line, i) => {
		const piece = pieces.at(-1);
		const previous = article.lines[i - 1] ?? '';
		const canSplit = STARTS_NEW_LINE.test(line) || (/[.:]$/.test(previous) && /^[A-Z]/.test(line));
		if (!piece || (canSplit && wordCount(piece.lines) + wordCount([line]) > TARGET_WORDS)) {
			pieces.push({ lines: [line], page: article.linePages[i] });
		} else {
			piece.lines.push(line);
		}
	});
	pieces.forEach((piece, i) => {
		const label = i === 0 ? '' : ` (part ${i + 1})`;
		add({ ...openChunk(article.ruleRef + label, article.headingPath, piece.page), lines: piece.lines });
	});
}

function wordCount(lines: string[]): number {
	return lines.join(' ').split(/\s+/).length;
}
