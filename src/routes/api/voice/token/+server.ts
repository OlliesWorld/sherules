import { json } from '@sveltejs/kit';
import { dev } from '$app/env';
import { limiter, voiceConfig } from '#lib/server/clients.ts';
import { takeAsk, VOICE_LIMITS } from '#lib/server/rate-limit.ts';
import { handleVoiceToken } from '#lib/server/voice.ts';
import type { RequestHandler } from './$types';

// POST /api/voice/token  body: { "sport": "volleyball", "league": "ncaa" }
// Starts a voice conversation: returns a short-lived LiveKit token for a new room with
// the SheRules voice agent dispatched into it. Called by the mic button on league pages.

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const input = (await request.json().catch(() => ({}))) as { sport?: unknown; league?: unknown };

	// Daily voice limits apply on the deployed site, as for typed questions. Without them
	// there'd be no cap on voice minutes, so production refuses instead.
	let takeSession: (() => ReturnType<typeof takeAsk>) | null = null;
	if (!dev) {
		const dailyLimits = limiter;
		if (!dailyLimits) {
			console.error('[sherules] Refusing voice session: daily limits are not configured');
			return json({ error: 'Voice is temporarily unavailable.' }, { status: 503 });
		}
		takeSession = () => takeAsk(dailyLimits, getClientAddress(), VOICE_LIMITS);
	}

	const { status, body } = await handleVoiceToken({ config: voiceConfig, sport: input.sport, league: input.league, takeSession });
	// Tokens are single-use and per visitor, so never cache them.
	return json(body, { status, headers: { 'cache-control': 'no-store' } });
};
