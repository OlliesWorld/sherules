import type { CapacitorConfig } from '@capacitor/cli';

// The native iOS and Android shells (ios/, android/) around the static app in build/.
// After changing this file or the app, run `npm run mobile:sync` (builds, then copies).
const config: CapacitorConfig = {
	// The store identity. Free to change until the app is first uploaded to a store, then permanent.
	appId: 'xyz.olliesworld.sherules',
	appName: 'SheRules',
	webDir: 'build',
	plugins: {
		SystemBars: {
			// app.html's viewport has viewport-fit=cover. Telling Capacitor up front lets Android
			// WebViews 140+ draw the page under the system bars from the first frame (the page pads
			// itself with env(safe-area-inset-*)); older WebViews get padded natively instead.
			initialViewportFitValueHint: 'cover'
		},
		SplashScreen: {
			// Hidden by the app once the first screen has drawn (+layout.svelte), so there's
			// no blank flash between the splash and the page. 5s is a safety net.
			launchAutoHide: false,
			launchShowDuration: 5000,
			showSpinner: false
		}
	}
};

export default config;
