// Terms people use that a league's rulebook calls something else (or doesn't have).
// "Reset timeout" is a WNBA rule; the NCAA book never says "reset", so a plain vector
// search for it finds nothing useful. A matching entry adds the rulebook's own words to
// the search and tells the answer model about the naming difference.
//
// The rule for adding an entry: the AI may suggest, the rulebook decides.
// - Every term in `rulebookTerms` must appear in that league's rulebook text.
// - Every ref in `refs` must be a real chunk ref for that league (glossary.test.ts checks
//   both against data/snapshots when the snapshots are present).
// - Good sources of candidates: `npm run logs -- --misses`, the rulebooks' definitions
//   sections, and "NCAA vs WNBA" style rule-difference articles (as leads, not answers).

export interface GlossaryEntry {
	sport: string;
	/** League slug, or '*' for every league in the sport. */
	league: string;
	/** What people type. Case-insensitive; keep them specific so unrelated questions don't match. */
	asked: RegExp[];
	/** This rulebook's own words for the idea, added to the search query. */
	rulebookTerms: string[];
	/** Passed to the answer model as background on naming. Never shown or cited as rule text. */
	note: string;
	/** Chunks that back the entry: where the rulebook terms are defined or used. */
	refs: string[];
}

// "time out", "time-out", "timeout", plural or not.
const TIMEOUT = String.raw`time[\s-]?outs?`;

export const GLOSSARY: GlossaryEntry[] = [
	{
		sport: 'basketball',
		league: 'ncaa',
		asked: [
			new RegExp(String.raw`\breset[\s-]*${TIMEOUT}\b`, 'i'),
			// "call a reset", "how many resets", "the reset rule". Not "the shot clock resets" or "reset the game clock".
			/\b(a|the|their|her|its|one|another|any|many|no|use[sd]?|call(s|ed)?|request(s|ed)?)\s+resets?\b(?!\s+(the\s+)?(shot|game)\b)/i
		],
		rulebookTerms: ['30-second timeout', 'last 59.9 seconds', 'throw-in in its frontcourt 28 feet from the end line'],
		note:
			'"Reset" (a "Reset timeout") is a WNBA rule. The NCAA women\'s rulebook has no Reset. ' +
			'The closest NCAA rules are the 30-second timeout and the option, after a timeout in the last 59.9 seconds ' +
			'of the fourth quarter or overtime, to throw in from the frontcourt 28 feet from the end line.',
		refs: ['Rule 5-14.2', 'Rule 5-14.5', 'Rule 5-14.9', 'Rule 5-14.10']
	},
	{
		sport: 'basketball',
		league: 'ncaa',
		asked: [new RegExp(String.raw`\b(mandatory|media|tv|television)\s+${TIMEOUT}\b`, 'i')],
		rulebookTerms: ['electronic-media timeout', 'electronic-media timeout format'],
		note:
			'The NCAA rulebook calls TV or media timeouts "electronic-media timeouts". ' +
			'"Mandatory timeout" is the WNBA term.',
		refs: ['Rule 5-13.2', 'Rule 5-14.10']
	},
	{
		sport: 'basketball',
		league: 'wnba',
		asked: [new RegExp(String.raw`\b(media|tv|television|electronic[\s-]media)\s+${TIMEOUT}\b`, 'i')],
		rulebookTerms: ['mandatory timeout', 'Official Scorer to take a timeout at the first dead ball'],
		note:
			'The WNBA rulebook calls the timeouts taken at set points in each period "mandatory timeouts". ' +
			'"Electronic-media timeout" is the NCAA term.',
		refs: ['Rule 5, Section VI-A, a–e']
	},
	{
		sport: 'basketball',
		league: 'wnba',
		asked: [new RegExp(String.raw`\b(30|thirty)[\s-]*second\s+${TIMEOUT}\b`, 'i'), new RegExp(String.raw`\bfull\s+${TIMEOUT}\b`, 'i')],
		rulebookTerms: ['charged timeouts', 'team timeouts', 'Mandatory timeouts shall be 2:45 in length', 'shall be 1:15'],
		note:
			'"30-second timeout" and "full timeout" are NCAA terms. The WNBA rulebook has charged team timeouts ' +
			'(mandatory timeouts and additional team timeouts, with set lengths) and a separate late-game Reset.',
		refs: ['Rule 5, Section VI-A, a–e', 'Rule 5, Section VI-B, a–i']
	},
	{
		sport: 'soccer',
		league: 'nwsl',
		asked: [/\byellow[\s-]*cards?\b/i, /\bred[\s-]*cards?\b/i, /\b(booked|booking)\b/i],
		rulebookTerms: ['caution', 'cautionable offences', 'sending-off', 'sent off'],
		note:
			'The IFAB Laws of the Game call a yellow card a "caution" and a red card a "sending-off".',
		refs: ['Law 12.4 (Cautionable offences)', 'Law 12.4 (Sending-off offences)']
	},
	// Same idea in all three hockey rulebooks, at different rule numbers.
	...(
		[
			['ncaa', ['Rule 16.2']],
			['pwhl', ['Rule 16.2']],
			['usa-hockey', ['Rule 402', 'Rule 409']]
		] as const
	).map(([league, refs]) => ({
		sport: 'hockey',
		league,
		asked: [/\bpower[\s-]*plays?\b/i, /\bman[\s-]*advantage\b/i, /\bpenalty[\s-]*kill(ing)?\b/i],
		rulebookTerms: ['short-handed', 'below the numerical strength of its opponent on the ice'],
		note:
			'Hockey rulebooks rarely say "power play". They describe the team with fewer players as "short-handed", ' +
			'meaning below the numerical strength of its opponent on the ice.',
		refs: [...refs]
	}))
];

/** Entries whose `asked` patterns match the question, for this sport and league. */
export function findGlossaryEntries(question: string, sport: string, league: string): GlossaryEntry[] {
	return GLOSSARY.filter(
		(entry) =>
			entry.sport === sport &&
			(entry.league === '*' || entry.league === league) &&
			entry.asked.some((pattern) => pattern.test(question))
	);
}

/** The question with the matching entries' rulebook terms appended, for the vector search. */
export function expandWithGlossary(question: string, entries: GlossaryEntry[]): string {
	const terms = [...new Set(entries.flatMap((entry) => entry.rulebookTerms))];
	return terms.length === 0 ? question : `${question} (rulebook terms: ${terms.join('; ')})`;
}
