import { fail } from '@sveltejs/kit';
import { dev } from '$app/env';
import { limiter, limiterMissing, ragDeps } from './clients.ts';
import { logQuestion, type QuestionLogEntry } from './log.ts';
import { askRulebook } from './rag.ts';
import { asksLeft, refundAsk, takeAsk } from './rate-limit.ts';

// Answering a typed question, shared by the sport page (league worked out from the question)
// and the league pages (league from the URL). Only SvelteKit code imports this file.

export const MAX_QUESTION_LENGTH = 500;

// The daily limits only apply on the deployed site, so local testing is unlimited.
export const LIMIT_ENABLED = !dev;

/** The trimmed question, or a fail() for the page if it's empty or too long. */
export function readQuestion(formData: FormData) {
	const question = String(formData.get('question') ?? '').trim();
	// These checks come before the limit, so a typo doesn't use up a question.
	if (question.length < 3) return { failure: fail(400, { question, error: 'Type a question first.' }) };
	if (question.length > MAX_QUESTION_LENGTH) {
		return { failure: fail(400, { question, error: `Keep questions under ${MAX_QUESTION_LENGTH} characters.` }) };
	}
	return { question };
}

/**
 * Applies the daily limit, answers from one league's rulebook, and logs it.
 * Returns what the page renders: { question, league, result, asksLeft } or a fail() (with question and league).
 */
export async function answerQuestion({
	question,
	sport,
	league,
	ip,
	leagueFrom
}: {
	question: string;
	sport: string;
	league: string;
	ip: string;
	/** Asked on the sport page: how the league was chosen (logged, for tuning league detection). */
	leagueFrom?: QuestionLogEntry['leagueFrom'];
}) {
	if (LIMIT_ENABLED) {
		// Without the limits there's no cap on AI spend, so turn questions away instead.
		if (!limiter) {
			console.error(`[sherules] Refusing questions: daily limits can't run. Missing: ${limiterMissing.join('; ')}`);
			return fail(503, { question, league, error: 'Questions are temporarily unavailable.' });
		}
		let allowed;
		try {
			allowed = await takeAsk(limiter, ip);
		} catch (err) {
			// Redis unreachable: refuse rather than answer without a spending limit.
			console.error('[sherules] Refusing question: could not reach Redis for the daily limit:', err);
			return fail(503, { question, league, error: 'Questions are temporarily unavailable.' });
		}
		if (allowed === 'visitor_limit') {
			await logQuestion({ question, sport, league, leagueFrom, result: 'rate_limited' });
			return fail(429, { question, league, limitReached: true });
		}
		if (allowed === 'global_limit') {
			await logQuestion({ question, sport, league, leagueFrom, result: 'at_capacity' });
			return fail(429, { question, league, atCapacity: true });
		}
	}

	const startedAt = Date.now();
	try {
		const result = await askRulebook(ragDeps, { question, sport, league });
		await logQuestion({
			question,
			sport,
			league,
			leagueFrom,
			result: result.found ? 'answered' : 'not_found',
			citations: result.citations.map((citation) => citation.ruleRef),
			retrieved: result.excerpts.map((excerpt) => ({
				ruleRef: excerpt.ruleRef,
				distance: Number(excerpt.distance.toFixed(3))
			})),
			rewrittenQuery: result.retrieval.rewrittenQuery,
			glossaryTerms: result.retrieval.glossaryTerms.length > 0 ? result.retrieval.glossaryTerms : undefined,
			ms: Date.now() - startedAt
		});
		// null = no count shown (local development, or Redis unreachable).
		const left = LIMIT_ENABLED && limiter ? await asksLeft(limiter, ip).catch(() => null) : null;
		// The excerpts panel (all retrieved rule text, with distances) and the notes are
		// tuning aids. In production they're left out, so only the cited rules' text reaches the page.
		return { question, league, result: dev ? result : { ...result, excerpts: [], notes: undefined }, asksLeft: left };
	} catch (err) {
		console.error('askRulebook failed', err);
		await logQuestion({ question, sport, league, leagueFrom, result: 'error', ms: Date.now() - startedAt });
		// The visitor got no answer, so this one doesn't count.
		if (LIMIT_ENABLED && limiter) await refundAsk(limiter, ip).catch(() => {});
		return fail(502, { question, league, error: 'Something went wrong looking that up. Please try again.' });
	}
}
