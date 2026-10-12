import { listSports } from '#lib/server/catalog.ts';
import { db } from '#lib/server/clients.ts';
import type { PageServerLoad } from './$types';

// Runs on the server before the page renders; what it returns becomes `data` in +page.svelte.
export const load: PageServerLoad = async () => {
	return { sports: await listSports(db) };
};
