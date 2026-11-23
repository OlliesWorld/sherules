import { apiJson, preflight } from '#lib/server/api.ts';
import { LIMIT_ENABLED } from '#lib/server/ask.ts';
import { installKey, limiter } from '#lib/server/clients.ts';
import { createInstallToken } from '#lib/server/install-token.ts';
import { INSTALL_LIMITS, takeAsk } from '#lib/server/rate-limit.ts';
import type { RequestHandler } from './$types';

// POST /api/v1/install -> { token }
// The app calls this on first launch and keeps the token (see install-token.ts). The daily
// question limits then count per install. New tokens are limited per IP (INSTALL_LIMITS).
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const unavailable = { status: 503, body: { error: 'Questions are temporarily unavailable.' } };
	if (!installKey) {
		console.error('[sherules] Refusing install token: RATE_LIMIT_SECRET is not set');
		return apiJson(request, unavailable);
	}

	if (LIMIT_ENABLED) {
		if (!limiter) return apiJson(request, unavailable);
		let allowed;
		try {
			allowed = await takeAsk(limiter, getClientAddress(), INSTALL_LIMITS);
		} catch (err) {
			console.error('[sherules] Refusing install token: could not reach Redis:', err);
			return apiJson(request, unavailable);
		}
		if (allowed !== 'ok') {
			return apiJson(request, { status: 429, body: { error: 'Too many new installs today. Please try again tomorrow.' } });
		}
	}

	const { token } = createInstallToken(installKey);
	return apiJson(request, { status: 200, body: { token } });
};

export const OPTIONS: RequestHandler = ({ request }) => preflight(request);
