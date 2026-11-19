import { error } from '@sveltejs/kit';
import { answerQuestion, LIMIT_ENABLED, readQuestion } from '#lib/server/ask.ts';
import { listLeagueSources } from '#lib/server/catalog.ts';
import { db, limiter, voiceConfig } from '#lib/server/clients.ts';
import { ASKS_PER_DAY, asksLeft } from '#lib/server/rate-limit.ts';
import { voiceAvailableFor } from '#lib/voice.ts';
import type { Actions, PageServerLoad } from './$types';

// One league's page. Sports with several leagues are asked from the sport page now, which
// works out the league from the question; this page serves single-league sports (rugby),
// the voice agent, and old links.
export const load: PageServerLoad = async ({ params, getClientAddress }) => {
	const sources = await listLeagueSources(db, params.sport, params.league);
	if (sources.length === 0) error(404, 'No rulebooks for this league yet');

	// null = no count shown (local development, limits not configured, or Redis unreachable)
	let left: number | null = null;
	if (LIMIT_ENABLED && limiter) {
		try {
			left = await asksLeft(limiter, getClientAddress());
		} catch (err) {
			console.error('[sherules] Could not read the daily limit from Redis:', err);
		}
	}

	return {
		sport: params.sport,
		league: params.league,
		sources,
		asksPerDay: ASKS_PER_DAY,
		asksLeft: left,
		// The mic button shows only where the voice agent has a rulebook, and only if LiveKit is set up.
		voiceEnabled: voiceConfig !== null && voiceAvailableFor(params.sport, params.league)
	};
};

// Form actions handle <form method="POST"> submissions on the server, similar to
// Next.js server actions. `?/ask` in the form's action attribute picks this one.
export const actions = {
	ask: async ({ request, params, getClientAddress }) => {
		const read = readQuestion(await request.formData());
		if (read.failure) return read.failure;
		// getClientAddress() is the visitor's IP (on Vercel, set by Vercel and not spoofable).
		return answerQuestion({ question: read.question, sport: params.sport, league: params.league, ip: getClientAddress() });
	}
} satisfies Actions;
