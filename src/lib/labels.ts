// Display names and copy for URL slugs. Used on both server and client.
// A slug missing here falls back to a capitalized version of itself.

const SPORT_NAMES: Record<string, string> = {
	volleyball: 'Volleyball',
	basketball: 'Basketball',
	soccer: 'Soccer',
	rugby: 'Rugby',
	hockey: 'Hockey'
};

const LEAGUE_NAMES: Record<string, string> = {
	ncaa: 'NCAA',
	pro: 'Pro',
	wnba: 'WNBA',
	nwsl: 'NWSL',
	all: 'All leagues',
	pwhl: 'PWHL',
	'usa-hockey': 'USA Hockey'
};

const LEAGUE_LEVELS: Record<string, string> = {
	ncaa: 'College',
	pro: 'Professional',
	wnba: 'Professional',
	nwsl: 'Professional',
	all: 'College and pro',
	pwhl: 'Professional',
	'usa-hockey': 'Amateur and youth'
};

// Leagues answered from another organization's rulebook name it in the page banner,
// with a note on what that means. Keyed by "sport/league".
const BORROWED_RULEBOOKS: Record<string, { rulebook: string; note: string }> = {
	'volleyball/pro': {
		rulebook: 'USA Volleyball Indoor Rules 2025-2027',
		note: 'LOVB and MLV may use their own variations of these rules.'
	},
	'soccer/nwsl': {
		rulebook: 'IFAB Laws of the Game 2026/27',
		note: 'NWSL plays under the IFAB Laws of the Game. League rules like substitutions and card suspensions come from the NWSL’s 2026 Competition Rules & Regulations.'
	},
	'rugby/all': {
		rulebook: 'World Rugby Laws of the Game 2026',
		note: 'Covers college, USA Rugby and Women’s Elite Rugby (WER), which all play World Rugby’s laws. Leagues may add their own rules; we’ll add them as each league publishes a rulebook.'
	}
};

// "Try asking" suggestions. Keep them to questions the ingested rulebook can answer.
const EXAMPLE_QUESTIONS: Record<string, string[]> = {
	volleyball: [
		'How many substitutions does each team get per set?',
		'What happens if the ball hits the antenna?',
		'Can a player wear jewelry?',
		'How does a coach’s challenge work?'
	],
	basketball: [
		'How long is the shot clock?',
		'How many fouls before a player fouls out?',
		'What is a flagrant foul?',
		'When does a team shoot bonus free throws?'
	],
	soccer: [
		'When is a player offside?',
		'How many substitutions does each team get?',
		'What gets a player a red card?',
		'What happens if the game is tied?'
	],
	rugby: [
		'What is a ruck?',
		'How long is a yellow card?',
		'What counts as a high tackle?',
		'How long is a sevens match?'
	],
	hockey: [
		'Is body checking allowed?',
		'What is icing?',
		'How long is a minor penalty?',
		'When is a player offside?'
	]
};

export function sportName(slug: string): string {
	return SPORT_NAMES[slug] ?? capitalize(slug);
}

export function leagueName(slug: string): string {
	return LEAGUE_NAMES[slug] ?? slug.toUpperCase();
}

/** "NCAA Volleyball", or just "Rugby" for a page that covers all leagues. */
export function pageHeading(sport: string, league: string): string {
	return league === 'all' ? sportName(sport) : `${leagueName(league)} ${sportName(sport)}`;
}

export function leagueLevel(slug: string): string | undefined {
	return LEAGUE_LEVELS[slug];
}

/** For the banner: "the 2026-27 NCAA rulebook", or the borrowed rulebook's name. */
export function rulebookLabel(sport: string, league: string, seasons: string): string {
	const borrowed = BORROWED_RULEBOOKS[`${sport}/${league}`];
	return borrowed ? `the ${borrowed.rulebook}` : `the ${seasons} ${leagueName(league)} rulebook`;
}

/** A caveat shown under the banner, if this league has one. */
export function rulebookNote(sport: string, league: string): string | undefined {
	return BORROWED_RULEBOOKS[`${sport}/${league}`]?.note;
}

export function exampleQuestions(sport: string): string[] {
	return EXAMPLE_QUESTIONS[sport] ?? [];
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}
