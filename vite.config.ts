import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Content Security Policy: the browser only runs scripts SvelteKit marks with a
			// per-request nonce (including the theme script in app.html), and only loads
			// fonts and styles from this site and Google Fonts. See src/hooks.server.ts for
			// the other security headers.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					// Svelte sets some inline styles (e.g. transitions), so inline styles are allowed.
					'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
					'font-src': ['self', 'https://fonts.gstatic.com'],
					'img-src': ['self', 'data:'],
					'connect-src': ['self'],
					'form-action': ['self'],
					'base-uri': ['self'],
					'object-src': ['none'],
					'frame-ancestors': ['none']
				}
			}
		})
	]
});
