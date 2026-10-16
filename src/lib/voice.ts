// Voice settings shared by the server and the browser.

/**
 * Sport/league pages that get the voice button. The voice agent's rulebook search
 * (/api/rules/search) only covers NCAA volleyball for now, so voice is limited to match.
 */
export const VOICE_LEAGUES = ['volleyball/ncaa'];

/** Longest voice conversation. The browser hangs up when it's reached. */
export const VOICE_MAX_SECONDS = 5 * 60;

export function voiceAvailableFor(sport: string, league: string): boolean {
	return VOICE_LEAGUES.includes(`${sport}/${league}`);
}
