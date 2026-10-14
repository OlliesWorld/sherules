// Display names and copy for URL slugs. Used on both server and client.
// A slug missing here falls back to a capitalized version of itself.

const SPORT_NAMES: Record<string, string> = {
	volleyball: 'Volleyball',
	basketball: 'Basketball'
};

const LEAGUE_NAMES: Record<string, string> = {
	ncaa: 'NCAA',
	pro: 'Pro',
	wnba: 'WNBA'
};

const LEAGUE_LEVELS: Record<string, string> = {
	ncaa: 'College',
	pro: 'Professional',
	wnba: 'Professional'
};

// Leagues answered from another organization's rulebook name it in the page banner,
// with a note on what that means. Keyed by "sport/league".
const BORROWED_RULEBOOKS: Record<string, { rulebook: string; note: string }> = {
	'volleyball/pro': {
		rulebook: 'USA Volleyball Indoor Rules 2025-2027',
		note: 'LOVB and MLV may use their own variations of these rules.'
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
	]
};

export function sportName(slug: string): string {
	return SPORT_NAMES[slug] ?? capitalize(slug);
}

export function leagueName(slug: string): string {
	return LEAGUE_NAMES[slug] ?? slug.toUpperCase();
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
