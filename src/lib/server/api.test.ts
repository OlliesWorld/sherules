// Tests for the mobile app API helpers (src/routes/api/v1/). Run with: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fail } from '@sveltejs/kit';
import { corsHeaders, preflight, readAskBody, toApiResult } from './api.ts';

describe('CORS', () => {
	it("allows the app's origins", () => {
		for (const origin of ['capacitor://localhost', 'https://localhost']) {
			assert.equal(corsHeaders(origin)['Access-Control-Allow-Origin'], origin);
		}
	});

	it('allows no other origin', () => {
		for (const origin of [null, 'https://evil.example', 'capacitor://evil', 'http://localhost']) {
			assert.equal(corsHeaders(origin)['Access-Control-Allow-Origin'], undefined, String(origin));
			assert.equal(corsHeaders(origin).Vary, 'Origin');
		}
	});

	it('answers preflights from the app and refuses others', () => {
		const request = (origin: string) => new Request('https://example.com/api/v1/ask', { method: 'OPTIONS', headers: { origin } });
		assert.equal(preflight(request('capacitor://localhost')).status, 204);
		assert.equal(preflight(request('https://evil.example')).status, 403);
	});
});

describe('readAskBody', () => {
	it('reads the fields', () => {
		assert.deepEqual(readAskBody({ sport: 'basketball', league: 'wnba', previousLeague: '', question: 'x' }), {
			sport: 'basketball',
			league: 'wnba',
			previousLeague: null,
			question: 'x'
		});
	});

	it('rejects bodies without a sport', () => {
		for (const body of [null, 'text', 42, {}, { sport: '' }, { sport: 3 }]) {
			assert.equal(readAskBody(body), null, JSON.stringify(body));
		}
	});

	it('ignores leagues that are not strings', () => {
		assert.equal(readAskBody({ sport: 'hockey', league: ['ncaa'] })?.league, null);
	});
});

describe('toApiResult', () => {
	it("turns a fail() into its status and data", () => {
		assert.deepEqual(toApiResult(fail(429, { limitReached: true })), { status: 429, body: { limitReached: true } });
	});

	it('passes answers through with 200', () => {
		assert.deepEqual(toApiResult({ question: 'q' }), { status: 200, body: { question: 'q' } });
	});
});
