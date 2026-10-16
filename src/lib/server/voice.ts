import { randomUUID } from 'node:crypto';
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';
import { VOICE_MAX_SECONDS, voiceAvailableFor } from '../voice.ts';
import type { AskResult } from './rate-limit.ts';

// Starts a voice conversation with the LiveKit agent (POST /api/voice/token).
// The browser can't hold LiveKit's API secret, so the server signs a short-lived token
// that lets this one visitor join a brand-new room, and asks LiveKit to send the agent
// (by its Agent Builder name) into that room. Kept separate from the route so it can be
// tested without SvelteKit, Redis or LiveKit.

export interface VoiceConfig {
	/** wss://<project>.livekit.cloud */
	url: string;
	apiKey: string;
	apiSecret: string;
	/** The agent's name in Agent Builder, used to dispatch it into the room. */
	agentName: string;
}

export interface VoiceSession {
	serverUrl: string;
	token: string;
	maxSeconds: number;
}

export type VoiceTokenBody = VoiceSession | { error: string; reason?: 'visitor_limit' | 'global_limit' };

export interface VoiceTokenInput {
	/** LiveKit settings, or null if they aren't all set. */
	config: VoiceConfig | null;
	sport: unknown;
	league: unknown;
	/** Uses up one of today's voice sessions; null when limits don't apply (local development). */
	takeSession: (() => Promise<AskResult>) | null;
}

/** Validates the request, applies the daily voice limits, and returns a session. Never throws. */
export async function handleVoiceToken(input: VoiceTokenInput): Promise<{ status: number; body: VoiceTokenBody }> {
	if (typeof input.sport !== 'string' || typeof input.league !== 'string' || !voiceAvailableFor(input.sport, input.league)) {
		return { status: 400, body: { error: 'Voice is not available for this league' } };
	}
	if (!input.config) {
		return { status: 503, body: { error: 'Voice is temporarily unavailable.' } };
	}

	if (input.takeSession) {
		let allowed: AskResult;
		try {
			allowed = await input.takeSession();
		} catch (err) {
			// Redis unreachable: refuse rather than start sessions without a limit.
			console.error('[sherules] Refusing voice session: could not reach Redis for the daily limit:', err);
			return { status: 503, body: { error: 'Voice is temporarily unavailable.' } };
		}
		if (allowed !== 'ok') {
			return { status: 429, body: { error: 'Daily voice limit reached', reason: allowed } };
		}
	}

	try {
		const token = await createToken(input.config, input.sport, input.league);
		return { status: 200, body: { serverUrl: input.config.url, token, maxSeconds: VOICE_MAX_SECONDS } };
	} catch (err) {
		console.error('[sherules] Could not create a voice token:', err);
		return { status: 500, body: { error: 'Could not start voice' } };
	}
}

/**
 * A token for one visitor to join one new room. The room name is random, so every
 * conversation is private; the agent is dispatched by name when the room is created.
 */
async function createToken(config: VoiceConfig, sport: string, league: string): Promise<string> {
	const room = `sherules-${randomUUID()}`;
	const token = new AccessToken(config.apiKey, config.apiSecret, {
		identity: `visitor-${randomUUID().slice(0, 8)}`,
		// Enough to join; the conversation itself is capped by VOICE_MAX_SECONDS.
		ttl: '10m'
	});
	token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
	token.roomConfig = new RoomConfiguration({
		agents: [
			new RoomAgentDispatch({
				agentName: config.agentName,
				// Available to the agent as {{metadata.sport}} / {{metadata.league}}.
				metadata: JSON.stringify({ sport, league })
			})
		]
	});
	return token.toJwt();
}
