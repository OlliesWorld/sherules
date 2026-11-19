import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { GoogleGenAI } from '@google/genai';
import { detectLeague } from '../league-detect.ts';
import { chooseLeague, guessLeague } from './guess-league.ts';

const LEAGUES: Record<string, string[]> = {
	basketball: ['ncaa', 'wnba'],
	volleyball: ['ncaa', 'pro'],
	soccer: ['ncaa', 'nwsl'],
	hockey: ['ncaa', 'pwhl', 'usa-hockey']
};

const detect = (question: string, sport: string) => detectLeague(question, sport, LEAGUES[sport]);

describe('detectLeague', () => {
	const cases: [sport: string, question: string, league: string][] = [
		['basketball', 'How long is the WNBA shot clock?', 'wnba'],
		['basketball', "what's the wnba's rule on resets", 'wnba'],
		['basketball', 'Is the W.N.B.A. three-point line farther?', 'wnba'],
		['basketball', 'How many fouls to foul out in college?', 'ncaa'],
		['basketball', 'NCAA shot clock length?', 'ncaa'],
		['basketball', 'Do D1 teams get 4 timeouts?', 'ncaa'],
		['basketball', 'Is it different in Division I?', 'ncaa'],
		['basketball', 'How many fouls in a pro game?', 'wnba'],
		['volleyball', 'Can the libero serve in LOVB?', 'pro'],
		['volleyball', 'MLV substitution rules', 'pro'],
		['volleyball', 'How many subs in college volleyball?', 'ncaa'],
		['soccer', 'How many subs in the NWSL?', 'nwsl'],
		['soccer', 'Is there extra time in college soccer?', 'ncaa'],
		['hockey', 'Is body checking allowed in the PWHL?', 'pwhl'],
		['hockey', 'Can my 14U daughter body check?', 'usa-hockey'],
		['hockey', 'Under USA Hockey rules what is a minor?', 'usa-hockey'],
		['hockey', 'NCAA icing rule', 'ncaa'],
		['basketball', 'How many reset timeouts does each team get?', 'wnba'],
		['basketball', 'Can a coach call a reset in the last two minutes?', 'wnba'],
		// A league's name beats a term from another league.
		['basketball', 'Is there a reset timeout in college?', 'ncaa']
	];
	for (const [sport, question, league] of cases) {
		it(`${sport}: "${question}" -> ${league}`, () => {
			assert.deepEqual(detect(question, sport), { kind: 'one', league });
		});
	}

	it('finds nothing in questions that name no league', () => {
		for (const [sport, question] of [
			['basketball', 'How long is the shot clock?'],
			['basketball', 'What are the pros and cons of a zone defense?'],
			['basketball', 'Is it a professional foul if she grabs the jersey?'],
			['basketball', 'When does a team get bonus free throws?'],
			['basketball', 'When does the shot clock reset?'],
			['basketball', 'Does the shot clock reset to 20 after a foul?'],
			['soccer', 'What is a professional foul?'],
			['hockey', 'What is icing?'],
			['volleyball', 'Can the libero attack?'],
			['volleyball', 'What if the ball hits the antenna?']
		]) {
			assert.deepEqual(detect(question, sport), { kind: 'none' }, question);
		}
	});

	it('returns every league a comparison names', () => {
		assert.deepEqual(detect('Is the NCAA shot clock the same as the WNBA?', 'basketball'), {
			kind: 'many',
			leagues: ['ncaa', 'wnba']
		});
	});

	it('ignores leagues this sport has no rulebook for', () => {
		assert.deepEqual(detectLeague('WNBA shot clock?', 'basketball', ['ncaa']), { kind: 'none' });
		assert.deepEqual(detect('Offside in the NWSL?', 'hockey'), { kind: 'none' });
	});
});

describe('chooseLeague', () => {
	const input = (question: string) => ({ question, sport: 'basketball', leagues: LEAGUES.basketball });

	it('uses a named league without calling the model', async () => {
		let called = false;
		const choice = await chooseLeague(input('WNBA shot clock?'), async () => ((called = true), 'ncaa'));
		assert.deepEqual(choice, { kind: 'one', league: 'wnba', how: 'named' });
		assert.equal(called, false);
	});

	it("uses the model's guess when no league is named", async () => {
		const choice = await chooseLeague(input('How many fouls can Caitlin Clark get?'), async () => 'wnba');
		assert.deepEqual(choice, { kind: 'one', league: 'wnba', how: 'guessed' });
	});

	it('asks the visitor when the model is unsure, fails, guesses nonsense, or is skipped', async () => {
		for (const guess of [async () => null, async () => Promise.reject(new Error('down')), async () => 'nba', undefined]) {
			assert.deepEqual(await chooseLeague(input('How long is the shot clock?'), guess), { kind: 'ask' });
		}
	});
});

/** A stand-in for the Gemini client that answers after `delayMs`, or never if it's aborted first. */
function fakeGenai(reply: string, delayMs: number) {
	let aborted = false;
	const genai = {
		models: {
			generateContent: ({ config }: { config: { abortSignal: AbortSignal } }) =>
				new Promise((resolve, reject) => {
					const timer = setTimeout(() => resolve({ text: JSON.stringify({ league: reply }) }), delayMs);
					config.abortSignal.addEventListener('abort', () => {
						aborted = true;
						clearTimeout(timer);
						reject(new Error('aborted'));
					});
				})
		}
	} as unknown as GoogleGenAI;
	return { genai, wasAborted: () => aborted };
}

describe('guessLeague', () => {
	const input = { question: 'Sabrina Ionescu fouls?', sport: 'basketball', leagues: LEAGUES.basketball };

	it('returns a fast answer', async () => {
		assert.equal(await guessLeague(fakeGenai('wnba', 5).genai, input, 200), 'wnba');
	});

	it('gives up (and cancels the call) after the timeout', async () => {
		const fake = fakeGenai('wnba', 5000);
		const started = Date.now();
		assert.equal(await guessLeague(fake.genai, input, 100), null);
		assert.ok(Date.now() - started < 1000, 'returned well before the slow reply');
		assert.equal(fake.wasAborted(), true);
	});

	it('treats "unknown" and leagues outside the list as no guess', async () => {
		assert.equal(await guessLeague(fakeGenai('unknown', 5).genai, input, 200), null);
		assert.equal(await guessLeague(fakeGenai('nba', 5).genai, input, 200), null);
	});
});
