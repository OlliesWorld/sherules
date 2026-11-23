import { isActionFailure, json } from '@sveltejs/kit';

// Helpers for the mobile app's JSON API (src/routes/api/v1/). Kept free of clients.ts, so
// they can be tested without the database or Redis.
//
// Contract: old app versions stay in use for months, so v1 responses only ever gain fields.
// A breaking change needs /api/v2.

/**
 * Origins the app runs on: Capacitor serves the bundled app from capacitor://localhost on
 * iOS and https://localhost on Android. http://localhost:5174 is the app's dev server.
 * CORS only governs browsers and webviews (a script can call the API anyway); the daily
 * limits are what protect it.
 */
export const APP_ORIGINS = new Set(['capacitor://localhost', 'https://localhost', 'http://localhost:5174']);

/** CORS headers for a response to this origin. Only the app's origins are allowed. */
export function corsHeaders(origin: string | null): Record<string, string> {
	if (!origin || !APP_ORIGINS.has(origin)) return { Vary: 'Origin' };
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Authorization, Content-Type',
		'Access-Control-Max-Age': '86400',
		Vary: 'Origin'
	};
}

/** Answers a CORS preflight (OPTIONS). */
export function preflight(request: Request): Response {
	const origin = request.headers.get('origin');
	const allowed = origin !== null && APP_ORIGINS.has(origin);
	return new Response(null, { status: allowed ? 204 : 403, headers: corsHeaders(origin) });
}

/** Cache headers: catalog responses are the same for everyone; anything per visitor is never cached. */
export const NO_STORE = { 'cache-control': 'no-store' };

/** A JSON response with the CORS headers for the request's origin. */
export function apiJson(
	request: Request,
	{ status, body }: { status: number; body: unknown },
	headers: Record<string, string> = NO_STORE
): Response {
	return json(body, { status, headers: { ...headers, ...corsHeaders(request.headers.get('origin')) } });
}

/** What ask.ts returned, as a status and body: a fail() becomes its status with its data. */
export function toApiResult(result: unknown): { status: number; body: unknown } {
	return isActionFailure(result) ? { status: result.status, body: result.data } : { status: 200, body: result };
}

export interface AskBody {
	sport: string;
	/** Ask this league's rulebook (a "Which league?" pick, "Ask X instead", or a single-league sport). */
	league: string | null;
	/** The league of the previous answer, so a follow-up stays with it. */
	previousLeague: string | null;
	/** Checked by readQuestion (ask.ts). */
	question: unknown;
}

/** The fields of a POST /api/v1/ask body, or null if it isn't an object with a sport. */
export function readAskBody(body: unknown): AskBody | null {
	if (typeof body !== 'object' || body === null) return null;
	const { sport, league, previousLeague, question } = body as Record<string, unknown>;
	if (typeof sport !== 'string' || sport === '') return null;
	const optional = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);
	return { sport, league: optional(league), previousLeague: optional(previousLeague), question };
}
