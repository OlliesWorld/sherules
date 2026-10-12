export type ChunkType = 'rule' | 'interpretation' | 'rule_change';

/** Which NCAA divisions a chunk applies to. Rulebook chunks are 'all'. */
export type Division = 'all' | 'd1' | 'd2-d3';

/** Names of the parsers in scripts/ingest.ts. Add one here when a new PDF layout needs it. */
export type ParserName =
	| 'ncaa-rulebook' // numbered headings: 1.2 SECTION / 1.2.3 Article (volleyball)
	| 'ncaa-sections'; // labeled headings: SECTION 2. / Art. 3. (basketball)

/** A run of pages (1-based, inclusive) that a parser should read, and what kind of content it holds. */
export interface PageRange {
	from: number;
	to: number;
	type: ChunkType;
}

/** A labeled page range that is deliberately not ingested. Listed in the summary so skips are visible. */
export interface SkippedRange {
	from: number;
	to: number;
	reason: string;
}

export interface Source {
	/** Stored on every chunk. Also the id prefix, so it must never change once ingested. */
	id: string;
	/** Shown to users as the link text. */
	name: string;
	/** Official PDF. Answers link to `${url}#page=N`. */
	url: string;
	/** Local copy in /data (gitignored). */
	file: string;
	sport: string;
	league: string;
	season: string;
	division: Division;
	parser: ParserName;
	ranges: PageRange[];
	skipped: SkippedRange[];
	/** Single pages inside a parsed range to leave out, e.g. a diagram with no rule text. */
	skipPages?: Record<number, string>;
}

/** One chunk as produced by a parser, before embedding. */
export interface ParsedChunk {
	ruleRef: string;
	type: ChunkType;
	headingPath: string;
	text: string;
	/** PDF page the chunk starts on (what #page=N uses). */
	page: number;
}

export interface PageProblem {
	page: number;
	reason: string;
}

export interface ParseResult {
	chunks: ParsedChunk[];
	problems: PageProblem[];
}
