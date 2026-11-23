import { Preferences } from '@capacitor/preferences';
import { error } from '@sveltejs/kit';
import type { AskOutcome } from '#lib/types.ts';

// The website's JSON API (src/routes/api/v1/ in the repo root). Catalog calls are used by
// the pages' load functions, so they throw SvelteKit errors (shown by +error.svelte); ask()
// never throws, it returns an outcome the AnswerPanel can show.

export const API_BASE = __API_BASE__;

const OFFLINE = "Can't reach SheRules. Check your connection and try again.";
const TOKEN_KEY = 'sherules.installToken';

type Fetch = typeof fetch;

export interface SportInfo {
	sport: string;
	leagues: { league: string; season: string }[];
	asksPerDay: number;
}

/** One rulebook document for a league (same shape as catalog.ts's LeagueSource). */
export interface LeagueSource {
	id: string;
	name: string;
	url: string;
	season: string;
}

export interface LeagueInfo {
	sport: string;
	league: string;
	sources: LeagueSource[];
	asksPerDay: number;
	/** null = no count to show (local development, or the count couldn't be read). */
	asksLeft: number | null;
}

/** GETs an API path, or throws a SvelteKit error for the error page. */
async function getJson<T>(fetch: Fetch, path: string, headers: Record<string, string> = {}): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${API_BASE}${path}`, { headers });
	} catch {
		error(503, OFFLINE);
	}
	const body = await response.json().catch(() => ({}));
	if (!response.ok) error(response.status, body.error ?? 'Something went wrong. Please try again.');
	return body as T;
}

export const getSports = (fetch: Fetch) => getJson<{ sports: string[] }>(fetch, '/api/v1/sports');

export const getSport = (fetch: Fetch, sport: string) =>
	getJson<SportInfo>(fetch, `/api/v1/sports/${encodeURIComponent(sport)}`);

/** With this install's token when there is one, so asksLeft is its count. */
export async function getLeague(fetch: Fetch, sport: string, league: string): Promise<LeagueInfo> {
	const token = await installToken().catch(() => null);
	return getJson<LeagueInfo>(
		fetch,
		`/api/v1/sports/${encodeURIComponent(sport)}/${encodeURIComponent(league)}`,
		token ? { authorization: `Bearer ${token}` } : {}
	);
}

// Install token: asked for once, then kept on the device (Capacitor Preferences; localStorage
// in a browser). The daily limits count per install (see install-token.ts in the website).

let pendingToken: Promise<string> | null = null;

/** This install's token, asking the server for one the first time. Throws if it can't get one. */
async function installToken(): Promise<string> {
	const { value } = await Preferences.get({ key: TOKEN_KEY });
	if (value) return value;
	// Two calls at once (a page load and a question) share one request.
	pendingToken ??= requestToken().finally(() => (pendingToken = null));
	return pendingToken;
}

async function requestToken(): Promise<string> {
	// Sent as JSON: SvelteKit refuses a cross-site POST without a JSON content type as a
	// possible form submission (CSRF protection), before the endpoint runs.
	const response = await fetch(`${API_BASE}/api/v1/install`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{}'
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok || typeof body.token !== 'string') {
		throw new Error(body.error ?? 'Something went wrong. Please try again.');
	}
	await Preferences.set({ key: TOKEN_KEY, value: body.token });
	return body.token;
}

export interface AskInput {
	sport: string;
	question: string;
	/** Ask this league's rulebook ("Which league?", "Ask X instead", or a single-league sport). */
	league?: string;
	/** The league of the previous answer, so a follow-up stays with it. */
	previousLeague?: string;
}

/** Asks a question. Never throws: problems come back as { error }, like the website's form. */
export async function ask(input: AskInput): Promise<AskOutcome> {
	const failed = (message: string): AskOutcome => ({ question: input.question, league: input.league, error: message });
	try {
		// A second try only if the server no longer accepts the stored token (e.g. its secret changed).
		for (let attempt = 1; attempt <= 2; attempt++) {
			const token = await installToken();
			const response = await fetch(`${API_BASE}/api/v1/ask`, {
				method: 'POST',
				headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
				body: JSON.stringify(input)
			});
			if (response.status === 401 && attempt === 1) {
				await Preferences.remove({ key: TOKEN_KEY });
				continue;
			}
			const body = (await response.json().catch(() => null)) as AskOutcome | null;
			// Errors come back in the same shape the page shows ({ error }, { limitReached }, ...).
			if (body && (response.ok || body.error || body.limitReached || body.atCapacity)) {
				return { question: input.question, ...body };
			}
			return failed('Something went wrong. Please try again.');
		}
		return failed('Something went wrong. Please try again.');
	} catch (err) {
		// fetch throws a TypeError when there's no connection.
		return failed(err instanceof TypeError ? OFFLINE : err instanceof Error ? err.message : OFFLINE);
	}
}
