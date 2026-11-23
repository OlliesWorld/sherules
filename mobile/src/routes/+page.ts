import { getSports } from '#mobile/api.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => getSports(fetch);
