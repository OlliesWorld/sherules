import { apiJson, preflight } from '#lib/server/api.ts';
import { LIMIT_ENABLED } from '#lib/server/ask.ts';
import { listLeagueSources } from '#lib/server/catalog.ts';
import { db, installKey, limiter } from '#lib/server/clients.ts';
import { bearerToken, verifyInstallToken } from '#lib/server/install-token.ts';
import { APP_ASK_LIMITS, appGate } from '#lib/server/rate-limit.ts';
import type { RequestHandler } from './$types';

// GET /api/v1/sports/:sport/:league -> { sport, league, sources, asksPerDay, asksLeft }
// The app's league screen. With the app's install token (Authorization: Bearer), asksLeft
// is that install's questions left today; without one, or in local development, it's null.
export const GET: RequestHandler = async ({ request, params, getClientAddress }) => {
	const sources = await listLeagueSources(db, params.sport, params.league);
	if (sources.length === 0) {
		return apiJson(request, { status: 404, body: { error: 'No rulebooks for this league yet' } });
	}

	let asksLeft: number | null = null;
	const installId = installKey && verifyInstallToken(installKey, bearerToken(request.headers.get('authorization')));
	if (LIMIT_ENABLED && limiter && installId) {
		try {
			asksLeft = await appGate(limiter, installId, getClientAddress()).left();
		} catch (err) {
			console.error('[sherules] Could not read the daily limit from Redis:', err);
		}
	}

	return apiJson(request, {
		status: 200,
		body: { sport: params.sport, league: params.league, sources, asksPerDay: APP_ASK_LIMITS.perVisitor, asksLeft }
	});
};

export const OPTIONS: RequestHandler = ({ request }) => preflight(request);
