import { apiJson, preflight, readAskBody, toApiResult } from '#lib/server/api.ts';
import { askForSport, readQuestion } from '#lib/server/ask.ts';
import { listLeagues } from '#lib/server/catalog.ts';
import { db, installKey, limiter } from '#lib/server/clients.ts';
import { bearerToken, verifyInstallToken } from '#lib/server/install-token.ts';
import { appGate } from '#lib/server/rate-limit.ts';
import type { RequestHandler } from './$types';

// POST /api/v1/ask  header: Authorization: Bearer <install token>
// body: { sport, question, league?, previousLeague? }
// The app's question box. Answers exactly like the website's sport page (askForSport in
// ask.ts), with the app's daily limits (per install, see appGate). The response is what the
// page's `form` gets: { question, league, result, asksLeft, elsewhere } or { question, chooseFrom },
// and on errors the same fields with a 4xx/5xx status ({ error }, { limitReached }, { atCapacity }).
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const installId = installKey && verifyInstallToken(installKey, bearerToken(request.headers.get('authorization')));
	if (!installId) {
		return apiJson(request, { status: 401, body: { error: 'Missing or invalid install token.' } });
	}

	const body = readAskBody(await request.json().catch(() => null));
	if (!body) return apiJson(request, { status: 400, body: { error: 'Expected a JSON body with a sport.' } });

	const read = readQuestion(body.question);
	if (read.failure) return apiJson(request, toApiResult(read.failure));

	const leagues = (await listLeagues(db, body.sport)).map(({ league }) => league);
	if (leagues.length === 0) return apiJson(request, { status: 404, body: { error: 'No rulebooks for this sport yet' } });
	if (body.league && !leagues.includes(body.league)) {
		return apiJson(request, { status: 404, body: { error: 'No rulebooks for this league yet' } });
	}

	const result = await askForSport({
		question: read.question,
		sport: body.sport,
		leagues,
		picked: body.league,
		previous: body.previousLeague && leagues.includes(body.previousLeague) ? body.previousLeague : null,
		gate: limiter ? appGate(limiter, installId, getClientAddress()) : null,
		client: 'app'
	});
	return apiJson(request, toApiResult(result));
};

export const OPTIONS: RequestHandler = ({ request }) => preflight(request);
