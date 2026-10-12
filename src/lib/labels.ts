// Display names and copy for URL slugs. Used on both server and client.
// A slug missing here falls back to a capitalized version of itself.

const SPORT_NAMES: Record<string, string> = {
	volleyball: 'Volleyball',
	basketball: 'Basketball'
};

const LEAGUE_NAMES: Record<string, string> = {
	ncaa: 'NCAA',
	wnba: 'WNBA'
};

const LEAGUE_LEVELS: Record<string, string> = {
	ncaa: 'College',
	wnba: 'Professional'
};

// "Try asking" suggestions. Keep them to questions the ingested rulebook can answer.
const EXAMPLE_QUESTIONS: Record<string, string[]> = {
	volleyball: [
		'How many substitutions does each team get per set?',
		'What happens if the ball hits the antenna?',
		'Can a player wear jewelry?',
		'How does a coach’s challenge work?'
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

export function exampleQuestions(sport: string): string[] {
	return EXAMPLE_QUESTIONS[sport] ?? [];
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}
