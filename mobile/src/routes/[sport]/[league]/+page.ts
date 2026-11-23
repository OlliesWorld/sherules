import { getLeague } from '#mobile/api.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => getLeague(fetch, params.sport, params.league);
