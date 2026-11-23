// Tests for the mobile app's install tokens. Run with: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bearerToken, createInstallToken, installTokenKey, verifyInstallToken } from './install-token.ts';

const KEY = installTokenKey('test-secret');

describe('install tokens', () => {
	it('verifies a token it made, returning its install id', () => {
		const { token, installId } = createInstallToken(KEY);
		assert.equal(verifyInstallToken(KEY, token), installId);
	});

	it('makes a different install id each time', () => {
		assert.notEqual(createInstallToken(KEY).installId, createInstallToken(KEY).installId);
	});

	it('rejects a token signed with another secret', () => {
		const { token } = createInstallToken(installTokenKey('another-secret'));
		assert.equal(verifyInstallToken(KEY, token), null);
	});

	it('rejects a token whose install id was changed', () => {
		const { token } = createInstallToken(KEY);
		const [id, signature] = token.split('.');
		const changed = (id[0] === 'A' ? 'B' : 'A') + id.slice(1);
		assert.equal(verifyInstallToken(KEY, `${changed}.${signature}`), null);
	});

	it('rejects a token whose signature was changed', () => {
		const { token } = createInstallToken(KEY);
		const last = token.at(-1) === 'A' ? 'B' : 'A';
		assert.equal(verifyInstallToken(KEY, token.slice(0, -1) + last), null);
	});

	it('rejects missing and malformed tokens', () => {
		for (const token of [null, undefined, '', 'abc', 'abc.def', `${'a'.repeat(22)}.`, `.${'a'.repeat(43)}`]) {
			assert.equal(verifyInstallToken(KEY, token), null, String(token));
		}
	});

	it('uses a different key from the IP hashing secret', () => {
		assert.notDeepEqual(KEY, Buffer.from('test-secret'));
	});
});

describe('bearerToken', () => {
	it('reads the token from an Authorization header', () => {
		assert.equal(bearerToken('Bearer abc.def'), 'abc.def');
		assert.equal(bearerToken('bearer abc.def'), 'abc.def');
	});

	it('returns null without a bearer token', () => {
		assert.equal(bearerToken(null), null);
		assert.equal(bearerToken('Basic abc'), null);
		assert.equal(bearerToken('Bearer'), null);
	});
});
