import { error, redirect } from '@sveltejs/kit';
import { askForSport, readQuestion } from '#lib/server/ask.ts';
import { CATALOG_CACHE_HEADERS, listLeagues } from '#lib/server/catalog.ts';
import { db, limiter } from '#lib/server/clients.ts';
import { ASKS_PER_DAY, ipGate } from '#lib/server/rate-limit.ts';
import type { Actions, PageServerLoad } from './$types';

// [sport] in the folder name is a route parameter, like /:sport in React Router.
// The same for every visitor (the daily count arrives with each answer), so the CDN can cache it.
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const leagues = await listLeagues(db, params.sport);
	if (leagues.length === 0) error(404, 'No rulebooks for this sport yet');
	// With only one league there's nothing to work out (rugby).
	if (leagues.length === 1) redirect(307, `/${params.sport}/${leagues[0].league}`);

	setHeaders(CATALOG_CACHE_HEADERS);
	return { sport: params.sport, leagues, asksPerDay: ASKS_PER_DAY };
};

export const actions = {
	// Asks without a league click. askForSport (ask.ts) works out the league, or asks.
	ask: async ({ request, params, getClientAddress }) => {
		const formData = await request.formData();
		const read = readQuestion(formData.get('question'));
		if (read.failure) return read.failure;

		const { sport } = params;
		const leagues = (await listLeagues(db, sport)).map(({ league }) => league);
		if (leagues.length === 0) error(404, 'No rulebooks for this sport yet');
		const valid = (value: FormDataEntryValue | null) =>
			typeof value === 'string' && leagues.includes(value) ? value : null;

		return askForSport({
			question: read.question,
			sport,
			leagues,
			picked: valid(formData.get('league')),
			previous: valid(formData.get('previousLeague')),
			gate: limiter ? ipGate(limiter, getClientAddress()) : null
		});
	}
} satisfies Actions;
