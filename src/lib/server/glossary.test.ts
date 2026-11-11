import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { sources } from '../ingest/sources.ts';
import { expandWithGlossary, findGlossaryEntries, GLOSSARY } from './glossary.ts';
import { mergeResults, type RetrievedChunk } from './search.ts';

const matches = (question: string, sport: string, league: string) =>
	findGlossaryEntries(question, sport, league).flatMap((entry) => entry.rulebookTerms);

describe('findGlossaryEntries', () => {
	it('maps the WNBA "Reset" to the NCAA rules that come closest', () => {
		for (const question of [
			'How many reset timeouts does each team get?',
			'Can a coach call a reset in the last two minutes?',
			'how many resets per game',
			'Is there a reset time-out in college?'
		]) {
			assert.ok(matches(question, 'basketball', 'ncaa').includes('30-second timeout'), question);
		}
	});

	it('leaves shot-clock and game-clock resets alone', () => {
		for (const question of [
			'When does the shot clock reset?',
			'Does the shot clock reset to 20 after a foul?',
			'Can the officials reset the game clock?',
			'What is a shot-clock reset?'
		]) {
			assert.deepEqual(matches(question, 'basketball', 'ncaa'), [], question);
		}
	});

	it('only applies an entry to its own league', () => {
		assert.deepEqual(matches('How many reset timeouts are there?', 'basketball', 'wnba'), []);
		assert.ok(matches('When are the TV timeouts?', 'basketball', 'ncaa').includes('electronic-media timeout'));
		assert.ok(matches('When are the TV timeouts?', 'basketball', 'wnba').includes('mandatory timeout'));
		assert.deepEqual(matches('When are the TV timeouts?', 'volleyball', 'ncaa'), []);
	});

	it('covers every hockey league', () => {
		for (const league of ['ncaa', 'pwhl', 'usa-hockey']) {
			assert.ok(matches('Does a power play end on a goal?', 'hockey', league).includes('short-handed'), league);
		}
	});
});

describe('expandWithGlossary', () => {
	it('returns the question unchanged when nothing matched', () => {
		assert.equal(expandWithGlossary('How long is the shot clock?', []), 'How long is the shot clock?');
	});

	it('appends each rulebook term once', () => {
		const entries = findGlossaryEntries('yellow card or red card?', 'soccer', 'nwsl');
		const expanded = expandWithGlossary('yellow card or red card?', [...entries, ...entries]);
		assert.equal(expanded.match(/sending-off/g)?.length, 1);
		assert.ok(expanded.startsWith('yellow card or red card? (rulebook terms: caution;'));
	});
});

describe('mergeResults', () => {
	const chunk = (id: string, distance: number) => ({ id, distance }) as RetrievedChunk;

	it('keeps each chunk once, at its closest distance, closest first', () => {
		const merged = mergeResults([[chunk('a', 0.4), chunk('b', 0.5)], [chunk('c', 0.2), chunk('a', 0.3)]], 5);
		assert.deepEqual(
			merged.map((c) => [c.id, c.distance]),
			[['c', 0.2], ['a', 0.3], ['b', 0.5]]
		);
	});

	it('returns at most the limit', () => {
		assert.equal(mergeResults([[chunk('a', 0.1), chunk('b', 0.2), chunk('c', 0.3)]], 2).length, 2);
	});
});

// The glossary's rule: every term and ref must come from the rulebook. This checks them
// against the parsed rulebooks in data/snapshots (`npm run snapshot -- save`). The
// rulebooks are copyrighted and not committed, so this skips where the snapshots are missing.
describe('glossary entries are backed by the rulebook text', () => {
	for (const entry of GLOSSARY) {
		const leagueSources = sources.filter((s) => s.sport === entry.sport && (entry.league === '*' || s.league === entry.league));
		const leagues = [...new Set(leagueSources.map((s) => s.league))];

		for (const league of leagues) {
			const files = leagueSources.filter((s) => s.league === league).map((s) => `data/snapshots/${s.id}.json`);
			const skip = files.some((file) => !existsSync(file)) && 'rulebook snapshots not present';

			it(`${entry.sport}/${league}: ${entry.rulebookTerms[0]}`, { skip }, () => {
				const chunks = files.flatMap(
					(file) => (JSON.parse(readFileSync(file, 'utf8')) as { chunks: { ruleRef: string; text: string }[] }).chunks
				);
				const text = chunks.map((c) => c.text).join('\n').toLowerCase().replace(/[–—]/g, '-');
				for (const term of entry.rulebookTerms) {
					assert.ok(text.includes(term.toLowerCase().replace(/[–—]/g, '-')), `"${term}" is not in the ${league} rulebook text`);
				}
				const refs = new Set(chunks.map((c) => c.ruleRef));
				for (const ref of entry.refs) {
					assert.ok(refs.has(ref), `${ref} is not a chunk in the ${league} rulebook`);
				}
			});
		}
	}
});
