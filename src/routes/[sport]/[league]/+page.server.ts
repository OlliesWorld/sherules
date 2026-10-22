import { error, fail } from '@sveltejs/kit';
import { dev } from '$app/env';
import { listLeagueSources } from '#lib/server/catalog.ts';
import { db, limiter, limiterMissing, ragDeps, voiceConfig } from '#lib/server/clients.ts';
import { logQuestion } from '#lib/server/log.ts';
import { askRulebook } from '#lib/server/rag.ts';
import { ASKS_PER_DAY, asksLeft, refundAsk, takeAsk } from '#lib/server/rate-limit.ts';
import { voiceAvailableFor } from '#lib/voice.ts';
import type { Actions, PageServerLoad } from './$types';

const MAX_QUESTION_LENGTH = 500;

// The daily limits only apply on the deployed site, so local testing is unlimited.
const LIMIT_ENABLED = !dev;

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
		const formData = await request.formData();
		const question = String(formData.get('question') ?? '').trim();

		// fail() returns the data to the page as `form`, with an error status.
		// These checks come before the limit, so a typo doesn't use up a question.
		if (question.length < 3) {
			return fail(400, { question, error: 'Type a question first.' });
		}
		if (question.length > MAX_QUESTION_LENGTH) {
			return fail(400, { question, error: `Keep questions under ${MAX_QUESTION_LENGTH} characters.` });
		}

		const { sport, league } = params;

		// getClientAddress() is the visitor's IP (on Vercel, set by Vercel and not spoofable).
		const ip = getClientAddress();
		if (LIMIT_ENABLED) {
			// Without the limits there's no cap on AI spend, so turn questions away instead.
			if (!limiter) {
				console.error(`[sherules] Refusing questions: daily limits can't run. Missing: ${limiterMissing.join('; ')}`);
				return fail(503, { question, error: 'Questions are temporarily unavailable.' });
			}
			let allowed;
			try {
				allowed = await takeAsk(limiter, ip);
			} catch (err) {
				// Redis unreachable: refuse rather than answer without a spending limit.
				console.error('[sherules] Refusing question: could not reach Redis for the daily limit:', err);
				return fail(503, { question, error: 'Questions are temporarily unavailable.' });
			}
			if (allowed === 'visitor_limit') {
				await logQuestion({ question, sport, league, result: 'rate_limited' });
				return fail(429, { question, limitReached: true });
			}
			if (allowed === 'global_limit') {
				await logQuestion({ question, sport, league, result: 'at_capacity' });
				return fail(429, { question, atCapacity: true });
			}
		}

		const startedAt = Date.now();
		try {
			const result = await askRulebook(ragDeps, { question, sport, league });
			await logQuestion({
				question,
				sport,
				league,
				result: result.found ? 'answered' : 'not_found',
				citations: result.citations.map((citation) => citation.ruleRef),
				retrieved: result.excerpts.map((excerpt) => ({
					ruleRef: excerpt.ruleRef,
					distance: Number(excerpt.distance.toFixed(3))
				})),
				ms: Date.now() - startedAt
			});
			// The excerpts panel (all retrieved rule text, with distances) and the notes are
			// tuning aids. In production they're left out, so only the cited rules' text reaches the page.
			return { question, result: dev ? result : { ...result, excerpts: [], notes: undefined } };
		} catch (err) {
			console.error('askRulebook failed', err);
			await logQuestion({ question, sport, league, result: 'error', ms: Date.now() - startedAt });
			// The visitor got no answer, so this one doesn't count.
			if (LIMIT_ENABLED && limiter) await refundAsk(limiter, ip).catch(() => {});
			return fail(502, { question, error: 'Something went wrong looking that up. Please try again.' });
		}
	}
} satisfies Actions;
