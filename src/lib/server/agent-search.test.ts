// Tests for the voice agent's search endpoint logic. Run with: npm test
// Uses Node's built-in test runner (node:test) through tsx, so no extra dependencies.
// The search function is a stand-in, so no database or Gemini calls are made.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleAgentSearch, MAX_QUERY_LENGTH, PASSAGE_LENGTH, trimPassage, type AgentSearchInput } from './agent-search.ts';
import type { RetrievedChunk } from './search.ts';

const KEY = 'test-agent-key';

function chunk(ruleRef: string, text: string): RetrievedChunk {
	return {
		id: `ncaa-volleyball-2026-27:${ruleRef}`,
		sourceId: 'ncaa-volleyball-2026-27',
		season: '2026-27',
		ruleRef,
		type: 'rule',
		headingPath: `Rule 11 – Game Interruptions > 11.3 SUBSTITUTIONS > ${ruleRef.replace('Rule ', '')} Limitations`,
		text,
		page: 51,
		distance: 0.2
	};
}

/** A request with a valid key and query; override any part per test. */
function request(overrides: Partial<AgentSearchInput> = {}): AgentSearchInput {
	return {
		providedKey: KEY,
		expectedKey: KEY,
		query: 'How many substitutions per set?',
		search: async (_query, limit) =>
			[chunk('Rule 11.3.2', 'For Division I, each team is entitled to 15 substitutions per set.'), chunk('Rule 11.3.1', 'a'), chunk('Rule 11.3.3', 'b'), chunk('Rule 11.3.4', 'c')].slice(0, limit),
		...overrides
	};
}

describe('GET /api/rules/search', () => {
	it('returns 401 when the key header is missing', async () => {
		const { status, body } = await handleAgentSearch(request({ providedKey: null }));
		assert.equal(status, 401);
		assert.deepEqual(body, { error: 'Unauthorized' });
	});

	it('returns 401 when the key is wrong', async () => {
		const { status } = await handleAgentSearch(request({ providedKey: 'wrong-key' }));
		assert.equal(status, 401);
	});

	it('returns 401 when no key is configured on the server', async () => {
		const { status } = await handleAgentSearch(request({ expectedKey: undefined }));
		assert.equal(status, 401);
	});

	it('returns 400 when q is missing', async () => {
		const { status } = await handleAgentSearch(request({ query: null }));
		assert.equal(status, 400);
	});

	it('returns 400 when q is empty or only spaces', async () => {
		assert.equal((await handleAgentSearch(request({ query: '' }))).status, 400);
		assert.equal((await handleAgentSearch(request({ query: '   ' }))).status, 400);
	});

	it('returns 400 when q is over the length limit', async () => {
		const { status } = await handleAgentSearch(request({ query: 'x'.repeat(MAX_QUERY_LENGTH + 1) }));
		assert.equal(status, 400);
	});

	it('returns up to 3 results with rule number, title and passage', async () => {
		let askedFor: { query: string; limit: number } | undefined;
		const { status, body } = await handleAgentSearch(
			request({
				query: '  How many substitutions per set?  ',
				search: async (query, limit) => {
					askedFor = { query, limit };
					return request().search(query, 10); // more than 3, to check the cap
				}
			})
		);

		assert.equal(status, 200);
		assert.deepEqual(askedFor, { query: 'How many substitutions per set?', limit: 3 });
		assert.ok('results' in body);
		assert.equal(body.results.length, 3);
		assert.deepEqual(body.results[0], {
			ruleNumber: 'Rule 11.3.2',
			title: '11.3.2 Limitations',
			passage: 'For Division I, each team is entitled to 15 substitutions per set.',
			type: 'rule',
			source: 'NCAA Women’s Volleyball Rules Book 2026-27'
		});
	});

	it('returns 500 with a short message, and no details, when search fails', async () => {
		const original = console.error;
		console.error = () => {}; // keep the expected error out of the test output
		try {
			const { status, body } = await handleAgentSearch(
				request({ search: async () => { throw new Error('Turso connection refused at 10.0.0.1'); } })
			);
			assert.equal(status, 500);
			assert.deepEqual(body, { error: 'Search failed' });
		} finally {
			console.error = original;
		}
	});
});

describe('trimPassage', () => {
	it('leaves short text alone', () => {
		assert.equal(trimPassage('A short rule.'), 'A short rule.');
	});

	it('cuts long text at a word break, about PASSAGE_LENGTH characters, ending with …', () => {
		const trimmed = trimPassage('word '.repeat(400));
		assert.ok(trimmed.length <= PASSAGE_LENGTH + 1);
		assert.ok(trimmed.endsWith('word…'));
	});
});
