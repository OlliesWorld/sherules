import type { Handle } from '@sveltejs/kit/hooks';
import { createInitialModeExpression } from 'mode-watcher';

// Runs on every request, like middleware. Two jobs:
// 1. Fill in mode-watcher's theme script in app.html (see the comment there).
// 2. Add security headers. The Content Security Policy itself is configured in vite.config.ts.

const THEME_SCRIPT = createInitialModeExpression();

const SECURITY_HEADERS: Record<string, string> = {
	// Don't let browsers guess file types (e.g. treat an upload as a script).
	'X-Content-Type-Options': 'nosniff',
	// Don't allow the site inside frames on other sites (older browsers; CSP covers newer ones).
	'X-Frame-Options': 'DENY',
	// Send only the origin, not full URLs, to other sites (e.g. the PDF links).
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	// The site uses none of these, so turn them off.
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
};

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%modewatcher.init%', THEME_SCRIPT)
	});

	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(name, value);
	}
	return response;
};
