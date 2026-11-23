import { apiJson, preflight } from '#lib/server/api.ts';
import { CATALOG_CACHE_HEADERS, listSports } from '#lib/server/catalog.ts';
import { db } from '#lib/server/clients.ts';
import type { RequestHandler } from './$types';

// GET /api/v1/sports -> { sports: ["basketball", ...] }
// The mobile app's home screen. Same for everyone, so the CDN caches it like the home page.
export const GET: RequestHandler = async ({ request }) =>
	apiJson(request, { status: 200, body: { sports: await listSports(db) } }, CATALOG_CACHE_HEADERS);

export const OPTIONS: RequestHandler = ({ request }) => preflight(request);
