import { apiJson, preflight } from '#lib/server/api.ts';
import { CATALOG_CACHE_HEADERS, listLeagues } from '#lib/server/catalog.ts';
import { db } from '#lib/server/clients.ts';
import { APP_ASK_LIMITS } from '#lib/server/rate-limit.ts';
import type { RequestHandler } from './$types';

// GET /api/v1/sports/:sport -> { sport, leagues: [{ league, season }], asksPerDay }
// The app's sport screen. With one league (rugby) the app goes straight to the league screen.
export const GET: RequestHandler = async ({ request, params }) => {
	const leagues = await listLeagues(db, params.sport);
	if (leagues.length === 0) {
		return apiJson(request, { status: 404, body: { error: 'No rulebooks for this sport yet' } });
	}
	return apiJson(
		request,
		{ status: 200, body: { sport: params.sport, leagues, asksPerDay: APP_ASK_LIMITS.perVisitor } },
		CATALOG_CACHE_HEADERS
	);
};

export const OPTIONS: RequestHandler = ({ request }) => preflight(request);
