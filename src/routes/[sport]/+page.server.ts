import { error, redirect } from '@sveltejs/kit';
import { CATALOG_CACHE_HEADERS, listLeagues } from '#lib/server/catalog.ts';
import { db } from '#lib/server/clients.ts';
import type { PageServerLoad } from './$types';

// [sport] in the folder name is a route parameter, like /:sport in React Router.
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const leagues = await listLeagues(db, params.sport);
	if (leagues.length === 0) error(404, 'No rulebooks for this sport yet');
	// With only one league there's nothing to pick (rugby).
	if (leagues.length === 1) redirect(307, `/${params.sport}/${leagues[0].league}`);

	setHeaders(CATALOG_CACHE_HEADERS);
	return { sport: params.sport, leagues };
};
