import { error, isActionFailure, redirect } from '@sveltejs/kit';
import { answerQuestion, LIMIT_ENABLED, readQuestion } from '#lib/server/ask.ts';
import { CATALOG_CACHE_HEADERS, listLeagues } from '#lib/server/catalog.ts';
import { db, limiter, ragDeps } from '#lib/server/clients.ts';
import { findGlossaryEntries } from '#lib/server/glossary.ts';
import { chooseLeague, guessLeague } from '#lib/server/guess-league.ts';
import { logQuestion } from '#lib/server/log.ts';
import { ASKS_PER_DAY, LEAGUE_GUESS_LIMITS, takeAsk } from '#lib/server/rate-limit.ts';
import type { Actions, PageServerLoad } from './$types';

// [sport] in the folder name is a route parameter, like /:sport in React Router.
// The same for every visitor (the daily count arrives with each answer), so the CDN can cache it.
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const leagues = await listLeagues(db, params.sport);
	if (leagues.length === 0) error(404, 'No rulebooks for this sport yet');
	// With only one league there's nothing to work out (rugby).
	if (leagues.length === 1) redirect(307, `/${params.sport}/${leagues[0].league}`);

	setHeaders(CATALOG_CACHE_HEADERS);
	return { sport: params.sport, leagues, asksPerDay: ASKS_PER_DAY };
};

export const actions = {
	// Asks without a league click. The league is, in order: the one the visitor picked
	// ("Which league?" or "Ask NCAA instead"), the one the question names, the model's guess
	// (up to 2 seconds), or the league of the previous answer. Otherwise we ask.
	ask: async ({ request, params, getClientAddress }) => {
		const formData = await request.formData();
		const read = readQuestion(formData);
		if (read.failure) return read.failure;
		const { question } = read;

		const { sport } = params;
		const leagues = (await listLeagues(db, sport)).map(({ league }) => league);
		if (leagues.length === 0) error(404, 'No rulebooks for this sport yet');
		const valid = (value: FormDataEntryValue | null) =>
			typeof value === 'string' && leagues.includes(value) ? value : null;
		const picked = valid(formData.get('league'));
		const previous = valid(formData.get('previousLeague'));
		const ip = getClientAddress();

		// The model guess costs a Gemini call, so it has its own daily limit. Without one
		// (limits not set up, Redis down, or used up) we go on as if it had no idea.
		const guessAllowed = async () => {
			if (!LIMIT_ENABLED) return true;
			if (!limiter) return false;
			return (await takeAsk(limiter, ip, LEAGUE_GUESS_LIMITS).catch(() => 'error')) === 'ok';
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
			await logQuestion({ question, sport, league: '', result: 'league_asked' });
			// The page shows "Which league?" with these, each resubmitting the question with `league`.
			return { question, chooseFrom };
		}

		const answered = await answerQuestion({ question, sport, league, ip, leagueFrom });
		if (isActionFailure(answered)) return answered;
		// How the other leagues differ on this question, from the verified glossary: a WNBA
		// "Reset" answer gets "NCAA has no Reset; the closest rule is…" under it.
		const elsewhere = leagues
			.filter((other) => other !== league)
			.flatMap((other) => findGlossaryEntries(question, sport, other).map(({ note }) => ({ league: other, note })));
		return { ...answered, elsewhere };
	}
} satisfies Actions;
