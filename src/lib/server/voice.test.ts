// Tests for starting a voice conversation (POST /api/voice/token). Run with: npm test
// Signing a LiveKit token happens locally, so these use dummy credentials and make no calls.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VOICE_MAX_SECONDS } from '../voice.ts';
import { handleVoiceToken, type VoiceConfig, type VoiceTokenInput } from './voice.ts';

const CONFIG: VoiceConfig = {
	url: 'wss://example.livekit.cloud',
	apiKey: 'APItestkey',
	apiSecret: 'test-secret-that-must-never-be-returned',
	agentName: 'sherules-agent'
};

function request(overrides: Partial<VoiceTokenInput> = {}): VoiceTokenInput {
	return { config: CONFIG, sport: 'volleyball', league: 'ncaa', takeSession: async () => 'ok', ...overrides };
}

/** Reads a JWT's payload (the middle part) without verifying it. */
function jwtPayload(token: string): Record<string, any> {
	return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

/** Runs fn with console.error silenced, for tests that expect an error to be logged. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
	const original = console.error;
	console.error = () => {};
	try {
		return await fn();
	} finally {
		console.error = original;
	}
}

describe('POST /api/voice/token', () => {
	it('returns 400 for a league without voice', async () => {
		assert.equal((await handleVoiceToken(request({ league: 'pro' }))).status, 400);
		assert.equal((await handleVoiceToken(request({ sport: 'basketball' }))).status, 400);
		assert.equal((await handleVoiceToken(request({ sport: undefined }))).status, 400);
	});

	it('returns 503 when LiveKit is not configured', async () => {
		assert.equal((await handleVoiceToken(request({ config: null }))).status, 503);
	});

	it('returns 429 with the reason when a daily voice limit is reached', async () => {
		const visitor = await handleVoiceToken(request({ takeSession: async () => 'visitor_limit' }));
		assert.equal(visitor.status, 429);
		assert.deepEqual(visitor.body, { error: 'Daily voice limit reached', reason: 'visitor_limit' });

		const global = await handleVoiceToken(request({ takeSession: async () => 'global_limit' }));
		assert.equal(global.status, 429);
	});

	it('returns 503 when the daily limit can’t be checked (Redis down)', async () => {
		const { status } = await quietly(() =>
			handleVoiceToken(request({ takeSession: async () => { throw new Error('Redis unreachable'); } }))
		);
		assert.equal(status, 503);
	});

	it('returns a token for a new room with the agent dispatched, and no secrets', async () => {
		const { status, body } = await handleVoiceToken(request());
		assert.equal(status, 200);
		assert.ok('token' in body);
		assert.equal(body.serverUrl, CONFIG.url);
		assert.equal(body.maxSeconds, VOICE_MAX_SECONDS);
		assert.ok(!JSON.stringify(body).includes(CONFIG.apiSecret), 'the API secret must never be returned');

		const payload = jwtPayload(body.token);
		assert.equal(payload.iss, CONFIG.apiKey);
		assert.match(payload.video.room, /^sherules-[0-9a-f-]{36}$/);
		assert.equal(payload.video.roomJoin, true);
		assert.equal(payload.video.canPublish, true);
		assert.equal(payload.roomConfig.agents[0].agentName, 'sherules-agent');
		assert.deepEqual(JSON.parse(payload.roomConfig.agents[0].metadata), { sport: 'volleyball', league: 'ncaa' });
		assert.ok(payload.exp - payload.nbf <= 10 * 60, 'token is short-lived');
	});

	it('gives every conversation its own room', async () => {
		const first = await handleVoiceToken(request());
		const second = await handleVoiceToken(request());
		assert.ok('token' in first.body && 'token' in second.body);
		assert.notEqual(jwtPayload(first.body.token).video.room, jwtPayload(second.body.token).video.room);
	});

	it('includes how many voice calls are left today, for the closing message', async () => {
		const { body } = await handleVoiceToken(request({ sessionsLeft: async () => 2 }));
		assert.ok('token' in body);
		assert.equal(body.sessionsLeft, 2);
	});

	it('still starts the call if the remaining count can’t be read', async () => {
		const { status, body } = await handleVoiceToken(request({ sessionsLeft: async () => { throw new Error('Redis down'); } }));
		assert.equal(status, 200);
		assert.ok('token' in body);
		assert.equal(body.sessionsLeft, undefined);
	});

	it('works without limits in local development (takeSession null)', async () => {
		assert.equal((await handleVoiceToken(request({ takeSession: null }))).status, 200);
	});
});
