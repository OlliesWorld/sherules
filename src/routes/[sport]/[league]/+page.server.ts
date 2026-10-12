import { error, fail } from '@sveltejs/kit';
import { listLeagueSources } from '#lib/server/catalog.ts';
import { db, ragDeps } from '#lib/server/clients.ts';
import { askRulebook } from '#lib/server/rag.ts';
import type { Actions, PageServerLoad } from './$types';

const MAX_QUESTION_LENGTH = 500;

export const load: PageServerLoad = async ({ params }) => {
	const sources = await listLeagueSources(db, params.sport, params.league);
	if (sources.length === 0) error(404, 'No rulebooks for this league yet');

	return { sport: params.sport, league: params.league, sources };
};

// Form actions handle <form method="POST"> submissions on the server, similar to
// Next.js server actions. `?/ask` in the form's action attribute picks this one.
export const actions = {
	ask: async ({ request, params }) => {
		const formData = await request.formData();
		const question = String(formData.get('question') ?? '').trim();

		// fail() returns the data to the page as `form`, with an error status.
		if (question.length < 3) {
			return fail(400, { question, error: 'Type a question first.' });
		}
		if (question.length > MAX_QUESTION_LENGTH) {
			return fail(400, { question, error: `Keep questions under ${MAX_QUESTION_LENGTH} characters.` });
		}

		try {
			const result = await askRulebook(ragDeps, { question, sport: params.sport, league: params.league });
			return { question, result };
		} catch (err) {
			console.error('askRulebook failed', err);
			return fail(502, { question, error: 'Something went wrong looking that up. Please try again.' });
		}
	}
} satisfies Actions;
