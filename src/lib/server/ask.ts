import { fail, isActionFailure } from '@sveltejs/kit';
import { dev } from '$app/env';
import { limiterMissing, ragDeps } from './clients.ts';
import { findGlossaryEntries } from './glossary.ts';
import { chooseLeague, guessLeague } from './guess-league.ts';
import { logQuestion, type QuestionLogEntry } from './log.ts';
import { askRulebook } from './rag.ts';
import type { LimitGate } from './rate-limit.ts';

// Answering a typed question, shared by the sport page (league worked out from the question),
// the league pages (league from the URL) and the app's POST /api/v1/ask.
// Only SvelteKit code imports this file.

export const MAX_QUESTION_LENGTH = 500;

// The daily limits only apply on the deployed site, so local testing is unlimited.
export const LIMIT_ENABLED = !dev;

type Client = NonNullable<QuestionLogEntry['client']>;

/** The trimmed question, or a fail() for the page if it's empty or too long. */
export function readQuestion(value: unknown) {
	const question = (typeof value === 'string' ? value : '').trim();
	// These checks come before the limit, so a typo doesn't use up a question.
	if (question.length < 3) return { failure: fail(400, { question, error: 'Type a question first.' }) };
	if (question.length > MAX_QUESTION_LENGTH) {
		return { failure: fail(400, { question, error: `Keep questions under ${MAX_QUESTION_LENGTH} characters.` }) };
	}
	return { question };
}

/**
 * Applies the daily limit, answers from one league's rulebook, and logs it.
 * `gate` is the visitor's daily limits (ipGate for the website, appGate for the app), or
 * null if they can't run (Redis or the secret isn't configured).
 * Returns what the page renders: { question, league, result, asksLeft } or a fail() (with question and league).
 */
export async function answerQuestion({
	question,
	sport,
	league,
	gate,
	client = 'web',
	leagueFrom
}: {
	question: string;
	sport: string;
	league: string;
	gate: LimitGate | null;
	client?: Client;
	/** Asked on the sport page: how the league was chosen (logged, for tuning league detection). */
	leagueFrom?: QuestionLogEntry['leagueFrom'];
}) {
	const log = (entry: Omit<QuestionLogEntry, 'question' | 'sport' | 'league' | 'leagueFrom' | 'client'>) =>
		logQuestion({ question, sport, league, leagueFrom, client, ...entry });

	if (LIMIT_ENABLED) {
		// Without the limits there's no cap on AI spend, so turn questions away instead.
		if (!gate) {
			console.error(`[sherules] Refusing questions: daily limits can't run. Missing: ${limiterMissing.join('; ')}`);
			return fail(503, { question, league, error: 'Questions are temporarily unavailable.' });
		}
		let allowed;
		try {
			allowed = await gate.take();
		} catch (err) {
			// Redis unreachable: refuse rather than answer without a spending limit.
			console.error('[sherules] Refusing question: could not reach Redis for the daily limit:', err);
			return fail(503, { question, league, error: 'Questions are temporarily unavailable.' });
		}
		if (allowed === 'visitor_limit') {
			await log({ result: 'rate_limited' });
			return fail(429, { question, league, limitReached: true });
		}
		if (allowed === 'global_limit') {
			await log({ result: 'at_capacity' });
			return fail(429, { question, league, atCapacity: true });
		}
	}

	const startedAt = Date.now();
	try {
		const result = await askRulebook(ragDeps, { question, sport, league });
		await log({
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
		const left = LIMIT_ENABLED && gate ? await gate.left().catch(() => null) : null;
		// The excerpts panel (all retrieved rule text, with distances) and the notes are
		// tuning aids. In production they're left out, so only the cited rules' text reaches the page.
		return { question, league, result: dev ? result : { ...result, excerpts: [], notes: undefined }, asksLeft: left };
	} catch (err) {
		console.error('askRulebook failed', err);
		await log({ result: 'error', ms: Date.now() - startedAt });
		// The visitor got no answer, so this one doesn't count.
		if (LIMIT_ENABLED && gate) await gate.refund().catch(() => {});
		return fail(502, { question, league, error: 'Something went wrong looking that up. Please try again.' });
	}
}

/**
 * Asks on a sport page, without a league in the URL. The league is, in order: the one the
 * visitor picked ("Which league?" or "Ask NCAA instead"), the one the question names, the
 * model's guess (up to 2 seconds), or the league of the previous answer. Otherwise we ask.
 * `leagues` is the sport's leagues (non-empty); `picked` and `previous` must be among them.
 */
export async function askForSport({
	question,
	sport,
	leagues,
	picked,
	previous,
	gate,
	client = 'web'
}: {
	question: string;
	sport: string;
	leagues: string[];
	picked: string | null;
	previous: string | null;
	gate: LimitGate | null;
	client?: Client;
}) {
	// The model guess costs a Gemini call, so it has its own daily limit. Without one
	// (limits not set up, Redis down, or used up) we go on as if it had no idea.
	const guessAllowed = async () => {
		if (!LIMIT_ENABLED) return true;
		if (!gate) return false;
		return (await gate.takeGuess().catch(() => 'error')) === 'ok';
	};

	let league: string | null = picked;
	let leagueFrom: 'picked' | 'named' | 'guessed' | 'previous' = 'picked';
	let chooseFrom = leagues;
	if (!league) {
		const choice = await chooseLeague({ question, sport, leagues }, async (q) =>
			(await guessAllowed()) ? guessLeague(ragDeps.genai, { question: q, sport, leagues }) : null
		);
		if (choice.kind === 'one') [league, leagueFrom] = [choice.league, choice.how];
		else if (choice.kind === 'many') chooseFrom = choice.leagues;
		else if (previous) [league, leagueFrom] = [previous, 'previous'];
	}

	if (!league) {
		await logQuestion({ question, sport, league: '', client, result: 'league_asked' });
		// The page shows "Which league?" with these, each resubmitting the question with `league`.
		return { question, chooseFrom };
	}

	const answered = await answerQuestion({ question, sport, league, gate, client, leagueFrom });
	if (isActionFailure(answered)) return answered;
	// How the other leagues differ on this question, from the verified glossary: a WNBA
	// "Reset" answer gets "NCAA has no Reset; the closest rule is…" under it.
	const elsewhere = leagues
		.filter((other) => other !== league)
		.flatMap((other) => findGlossaryEntries(question, sport, other).map(({ note }) => ({ league: other, note })));
	return { ...answered, elsewhere };
}
