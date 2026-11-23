<script lang="ts">
	import '@fontsource/archivo/latin-700.css';
	import '@fontsource/archivo/latin-800.css';
	import '@fontsource/archivo/latin-900.css';
	import '@fontsource/sora/latin-400.css';
	import '@fontsource/sora/latin-500.css';
	import '@fontsource/sora/latin-600.css';
	import '@fontsource/sora/latin-700.css';
	import '@fontsource/sora/latin-800.css';
	import '@fontsource/jetbrains-mono/latin-400.css';
	import '@fontsource/jetbrains-mono/latin-700.css';
	import '../app.css';
	import { Browser } from '@capacitor/browser';
	import { Capacitor } from '@capacitor/core';
	import Breadcrumbs, { type Crumb } from '#lib/components/Breadcrumbs.svelte';
	import HeroDecor from '#lib/components/HeroDecor.svelte';
	import SportIcon from '#lib/components/SportIcon.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import WhistleMark from '#lib/components/WhistleMark.svelte';
	import { sportName } from '#lib/labels.ts';
	import { page } from '$app/state';
	import { ModeWatcher } from 'mode-watcher';
	import type { LayoutProps } from './$types';

	// The website's layout (src/routes/+layout.svelte), for the app. Fonts are bundled
	// instead of loaded from Google, so the app looks right offline.
	let { children }: LayoutProps = $props();

	let pageSport = $derived(page.error ? undefined : page.params.sport);
	let sport = $derived(pageSport ?? 'volleyball');
	let crumbs = $derived<Crumb[]>(
		page.params.sport && !page.error
			? [
					{ label: 'Home', href: '/' },
					{
						label: sportName(page.params.sport),
						href: page.params.league ? `/${page.params.sport}` : undefined
					}
				]
			: []
	);

	// Links off the app (the rulebook PDFs) open in an in-app browser sheet, so the app
	// stays underneath. In a desktop browser (mobile:dev) they open in a new tab as usual.
	function openExternalLinks(event: MouseEvent) {
		if (!Capacitor.isNativePlatform() || event.defaultPrevented) return;
		const link = (event.target as Element | null)?.closest?.('a[href]');
		if (!(link instanceof HTMLAnchorElement) || link.origin === location.origin) return;
		event.preventDefault();
		Browser.open({ url: link.href });
	}
</script>

<svelte:document onclick={openExternalLinks} />

<svelte:head>
	<title>SheRules</title>
</svelte:head>

<!-- The first-paint theme is set by static/theme-init.js (see app.html). -->
<ModeWatcher disableHeadScriptInjection />

<div data-sport={sport} class="relative min-h-screen bg-background text-foreground">
	<div aria-hidden="true" class="pointer-events-none absolute inset-x-0 top-0 h-120 overflow-hidden">
		<div class="hero-glow absolute inset-0"></div>
		<div class="relative mx-auto h-full max-w-3xl">
			<HeroDecor sport={pageSport} />
		</div>
	</div>

	<header class="relative mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
		<a href="/" class="group flex items-center gap-[0.35em] font-display text-2xl font-black tracking-tight sm:text-3xl">
			{#if pageSport}
				<SportIcon
					sport={pageSport}
					class="size-[1em] shrink-0 text-sport transition-transform duration-400 group-hover:rotate-35"
				/>
			{:else}
				<WhistleMark
					class="size-[1.2em] shrink-0 text-sport transition-transform duration-400 group-hover:-rotate-12"
				/>
			{/if}
			SheRules
		</a>
		<ThemeToggle />
	</header>

	<main class="page-enter relative mx-auto max-w-3xl px-5 pb-16">
		{#if crumbs.length > 0}
			<div class="mt-2 mb-8">
				<Breadcrumbs items={crumbs} />
			</div>
		{/if}
		<!-- Keyed by path, so moving to another sport starts with an empty question box. -->
		{#key page.url.pathname}
			{@render children()}
		{/key}
	</main>
</div>
