import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// The SheRules mobile app: a single-page app built to static files (build/) that Capacitor
// bundles into the iOS and Android apps. It talks to the website's JSON API
// (src/routes/api/v1/ in the repo root) and reuses the website's components: `shared` is a
// symlink to ../src/lib, imported as #lib/* (package.json "imports"), like on the website.

const PRODUCTION_API = 'https://sherules.olliesworld.xyz';
// The website's dev server, for `npm run mobile:dev`.
const DEVELOPMENT_API = 'http://localhost:5173';

// Sets light/dark before the first paint, like the website's theme script (hooks.server.ts),
// but as a file: there's no server here to fill in a nonce, and the CSP only allows 'self' scripts.
// It's what mode-watcher's createInitialModeExpression() returns. That can't be imported here
// (mode-watcher only exports Svelte code), so this reads its setInitialMode function the same way.
function themeInitScript(): string {
	const file = ['../node_modules', './node_modules']
		.map((dir) => new URL(`${dir}/mode-watcher/dist/mode.js`, import.meta.url))
		.find((url) => existsSync(url));
	if (!file) throw new Error('mode-watcher is not installed');
	const source = readFileSync(file, 'utf8');
	const start = source.indexOf('function setInitialMode(');
	const end = source.indexOf('\n}\n', start);
	if (start === -1 || end === -1) throw new Error('setInitialMode not found in mode-watcher; update themeInitScript()');
	return `(${source.slice(start, end + 2)})({});\n`;
}
mkdirSync(new URL('./static/', import.meta.url), { recursive: true });
writeFileSync(new URL('./static/theme-init.js', import.meta.url), themeInitScript());

export default defineConfig(({ mode }) => {
	// VITE_API_BASE overrides the API, e.g. a Vercel preview deploy.
	// (Typed as a host source for the CSP config below.)
	const apiBase = (process.env.VITE_API_BASE ?? (mode === 'development' ? DEVELOPMENT_API : PRODUCTION_API)) as `https://${string}.${string}`;

	return {
		// Read as __API_BASE__ in src/lib/api.ts.
		define: { __API_BASE__: JSON.stringify(apiBase) },
		plugins: [
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
				},
				// fallback: every path loads index.html, and the client-side router takes it from there.
				adapter: adapter({ fallback: 'index.html' }),
				// Same policy as the website (vite.config.ts in the root), plus the API. Hash mode,
				// because a static app has no server to hand out nonces.
				csp: {
					mode: 'hash',
					directives: {
						'default-src': ['self'],
						'script-src': ['self'],
						'style-src': ['self', 'unsafe-inline'],
						'font-src': ['self'],
						'img-src': ['self', 'data:'],
						'connect-src': ['self', apiBase],
						'form-action': ['self'],
						'base-uri': ['self'],
						'object-src': ['none']
					}
				}
			})
		]
	};
});
