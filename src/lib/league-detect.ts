// Finds which league a question names, so a visitor can ask from the sport page without
// picking a league first. Plain patterns, no model call: instant, free and testable.
// Questions that name no league fall through to the model's guess (server/guess-league.ts),
// then to asking the visitor. Used on the server; kept out of server/ so the browser could use it too.

export type LeagueMatch =
	| { kind: 'one'; league: string }
	/** The question names several leagues, e.g. a comparison. */
	| { kind: 'many'; leagues: string[] }
	| { kind: 'none' };

/** College, in any sport. */
const NCAA = /\b(ncaa|college|collegiate|d-?(?:1|2|3|i{1,3})|div(?:ision)?\.? ?(?:1|2|3|i{1,3}))\b/i;

/**
 * "Pro" phrasing. It means a different league in each sport, so it's mapped per sport below.
 * Only "pro" followed by a game word counts, so "pros and cons" and "professional foul" don't.
 */
const PRO = /\b(?:in the pros|pro(?:fessional)? (?:game|games|league|leagues|level|match|matches|players?|teams?|basketball|soccer|hockey|volleyball))\b/i;

/** Patterns for each sport's leagues. A league missing from the catalog is ignored. */
const PATTERNS: Record<string, Record<string, RegExp[]>> = {
	basketball: {
		ncaa: [NCAA],
		wnba: [/\bw\.?n\.?b\.?a\b/i, PRO]
	},
	volleyball: {
		ncaa: [NCAA],
		pro: [/\b(lovb|mlv|major league volleyball|league one volleyball|usav|usa volleyball)\b/i, PRO]
	},
	soccer: {
		ncaa: [NCAA],
		nwsl: [/\bnwsl\b/i, /\bnational women'?s soccer league\b/i, PRO]
	},
	hockey: {
		ncaa: [NCAA],
		pwhl: [/\bpwhl\b/i, PRO],
		'usa-hockey': [/\b(usa ?hockey|usah|youth hockey|youth league|1[0-9] ?u|u ?1[0-9])\b/i]
	}
};

/**
 * Words only one league's rulebook uses. Weaker than a league's name: "Is there a reset in
 * college?" goes to NCAA (whose glossary entry explains it has no Reset).
 * Keep in step with the glossary (server/glossary.ts), which maps these for the other leagues.
 */
const TERMS: Record<string, Record<string, RegExp[]>> = {
	basketball: {
		wnba: [
			/\breset[\s-]*time[\s-]?outs?\b/i,
			// "call a reset", "how many resets". Not "the shot clock resets" or "reset the game clock".
			/\b(a|the|their|her|its|one|another|any|many|no|use[sd]?|call(s|ed)?|request(s|ed)?)\s+resets?\b(?!\s+(the\s+)?(shot|game)\b)/i
		]
	}
};

const matching = (table: Record<string, Record<string, RegExp[]>>, question: string, sport: string, leagues: string[]) =>
	leagues.filter((league) => table[sport]?.[league]?.some((pattern) => pattern.test(question)));

/** Which of `leagues` (the ones with rulebooks for this sport) the question names, or uses a term only it has. */
export function detectLeague(question: string, sport: string, leagues: string[]): LeagueMatch {
	let named = matching(PATTERNS, question, sport, leagues);
	if (named.length === 0) named = matching(TERMS, question, sport, leagues);
	if (named.length === 1) return { kind: 'one', league: named[0] };
	if (named.length > 1) return { kind: 'many', leagues: named };
	return { kind: 'none' };
}
