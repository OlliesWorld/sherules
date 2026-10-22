import { parseNcaaRulebook } from './chunk-ncaa-rulebook.ts';
import { parseNcaaSections } from './chunk-ncaa-sections.ts';
import { parseNcaaArticles } from './chunk-ncaa-articles.ts';
import { parseFivbRules } from './chunk-fivb-rules.ts';
import { parseUsavCasebook } from './chunk-usav-casebook.ts';
import { parseNbaRules } from './chunk-nba-rules.ts';
import { parseIfabLaws } from './chunk-ifab-laws.ts';
import { parseCapsHeadings } from './chunk-caps-headings.ts';
import { parseWorldRugbyLaws } from './chunk-world-rugby-laws.ts';
import { parseNcaaHockey } from './chunk-ncaa-hockey.ts';
import { parseMemo } from './chunk-memo.ts';
import { parsePwhlRules } from './chunk-pwhl-rules.ts';
import { parseUsahRules } from './chunk-usah-rules.ts';
import type { ParserName, ParseResult, Source } from './types.ts';

/** Every parser, by the name a source's `parser` field uses. Shared by the ingest and snapshot scripts. */
export const parsers: Record<ParserName, (pages: string[], source: Source) => ParseResult> = {
	'ncaa-rulebook': parseNcaaRulebook,
	'ncaa-sections': parseNcaaSections,
	'ncaa-articles': parseNcaaArticles,
	'fivb-rules': parseFivbRules,
	'usav-casebook': parseUsavCasebook,
	'nba-rules': parseNbaRules,
	'ifab-laws': parseIfabLaws,
	'caps-headings': parseCapsHeadings,
	'world-rugby-laws': parseWorldRugbyLaws,
	'ncaa-hockey': parseNcaaHockey,
	memo: parseMemo,
	'pwhl-rules': parsePwhlRules,
	'usah-rules': parseUsahRules
};
