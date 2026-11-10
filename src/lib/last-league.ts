// Remembers the league a visitor last used for each sport, so returning to that sport
// skips the picker. Browser storage can be blocked (private windows), so failures are ignored.

const key = (sport: string) => `sherules:last-league:${sport}`;

export function rememberLeague(sport: string, league: string): void {
	try {
		localStorage.setItem(key(sport), league);
	} catch {
		// Not remembered; the visitor just picks again next time.
	}
}

export function recallLeague(sport: string): string | null {
	try {
		return localStorage.getItem(key(sport));
	} catch {
		return null;
	}
}
