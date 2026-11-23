import { redirect } from '@sveltejs/kit';
import { getSport } from '#mobile/api.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
	const info = await getSport(fetch, params.sport);
	// With only one league there's nothing to work out (rugby).
	if (info.leagues.length === 1) redirect(307, `/${params.sport}/${info.leagues[0].league}`);
	return info;
};
