import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Install tokens for the mobile app. On first launch the app asks POST /api/v1/install for
// one, keeps it, and sends it with every question (Authorization: Bearer <token>). The daily
// limits then count per install rather than per IP (see appGate in rate-limit.ts).
//
// A token is "<installId>.<signature>": a random id plus an HMAC of it, so only this server
// can make one. Nothing is stored: a token is valid if its signature checks out. Making many
// tokens is held back by INSTALL_LIMITS (per IP) and the app's per-IP question ceiling.

/** The signing key, derived from RATE_LIMIT_SECRET so it's never the same key as the IP hashing. */
export function installTokenKey(secret: string): Buffer {
	return createHmac('sha256', secret).update('sherules:install-token').digest();
}

function sign(key: Buffer, installId: string): string {
	return createHmac('sha256', key).update(installId).digest('base64url');
}

/** A new token, with a fresh random install id. */
export function createInstallToken(key: Buffer): { token: string; installId: string } {
	const installId = randomBytes(16).toString('base64url');
	return { token: `${installId}.${sign(key, installId)}`, installId };
}

// 16 bytes in base64url is 22 characters; a SHA-256 signature is 43.
const TOKEN_PATTERN = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

/** The install id, or null if the token is missing, malformed, or not signed by this key. */
export function verifyInstallToken(key: Buffer, token: string | null | undefined): string | null {
	const match = token ? TOKEN_PATTERN.exec(token) : null;
	if (!match) return null;
	const [, installId, signature] = match;
	const expected = Buffer.from(sign(key, installId));
	const given = Buffer.from(signature);
	// Constant-time compare, so the signature can't be guessed byte by byte from response times.
	return given.length === expected.length && timingSafeEqual(given, expected) ? installId : null;
}

/** The token from an "Authorization: Bearer <token>" header, or null. */
export function bearerToken(header: string | null): string | null {
	const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
	return match ? match[1] : null;
}
