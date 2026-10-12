import { defineEnvVars } from '@sveltejs/kit/env';

// SvelteKit 3 reads environment variables from this list. None are public, so they are
// only importable from '$app/env/private', which SvelteKit refuses to bundle for the browser.
// Locally they come from your shell (or a .env file); on Vercel, from Project Settings.
export const variables = defineEnvVars({
	GEMINI_API_KEY: {
		schema: required('GEMINI_API_KEY'),
		description: 'Gemini API key from https://aistudio.google.com/apikey'
	},
	TURSO_DATABASE_URL: {
		schema: required('TURSO_DATABASE_URL'),
		description: 'file:local.db for local dev, libsql://<db>-<org>.turso.io for Turso Cloud'
	},
	TURSO_AUTH_TOKEN: {
		// Optional: a local file database has no token.
		schema: (value: string | undefined) => value || undefined,
		description: 'Turso database token. Leave unset for a local file database.'
	},

	// Upstash Redis for the question log (src/lib/server/log.ts). All optional: without them,
	// questions just aren't logged. Vercel's Redis integration sets the KV_* names;
	// a database created directly in Upstash uses the UPSTASH_* names.
	KV_REST_API_URL: { schema: optional, description: 'Redis REST URL (Vercel integration)' },
	KV_REST_API_TOKEN: { schema: optional, description: 'Redis REST token (Vercel integration)' },
	UPSTASH_REDIS_REST_URL: { schema: optional, description: 'Redis REST URL (Upstash directly)' },
	UPSTASH_REDIS_REST_TOKEN: { schema: optional, description: 'Redis REST token (Upstash directly)' }
});

function optional(value: string | undefined): string | undefined {
	return value || undefined;
}

function required(name: string) {
	return (value: string | undefined): string => {
		if (!value) throw new Error(`${name} is not set`);
		return value;
	};
}
