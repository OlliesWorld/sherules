import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';

// Keeps the phone's status bar (and Android's navigation bar) in step with the app's
// light/dark theme, including when the theme toggle doesn't match the phone's setting.

/** The app's page background in each theme (--background in src/routes/layout.css). */
const BACKGROUND = { light: '#fbfaf6', dark: '#060e18' };

/** The app's own Android plugin (android/.../WindowBackgroundPlugin.java). */
const WindowBackground = registerPlugin<{ set(options: { color: string }): Promise<void> }>('WindowBackground');

export async function matchSystemBars(dark: boolean): Promise<void> {
	if (!Capacitor.isNativePlatform()) return;
	// Dark style = light icons, for a dark background.
	await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
	// After setStyle, which resets the window background on Android.
	if (Capacitor.getPlatform() === 'android') {
		await WindowBackground.set({ color: dark ? BACKGROUND.dark : BACKGROUND.light });
	}
}
