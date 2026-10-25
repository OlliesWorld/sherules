<script lang="ts">
	import './layout.css';
	import Breadcrumbs, { type Crumb } from '#lib/components/Breadcrumbs.svelte';
	import HeroDecor from '#lib/components/HeroDecor.svelte';
	import SportIcon from '#lib/components/SportIcon.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { leagueName, sportName } from '#lib/labels.ts';
	import { page } from '$app/state';
	import { ModeWatcher } from 'mode-watcher';
	import WhistleMark from '#lib/components/WhistleMark.svelte';
	import type { LayoutProps } from './$types';

	// `children` is the current page. {@render children()} below is the Svelte
	// equivalent of rendering {children} in a React layout.
	let { children }: LayoutProps = $props();

	// `page` from $app/state is reactive, like a router hook in React.
	// The sport in the URL, if this page has one (not on home or error pages).
	let pageSport = $derived(page.error ? undefined : page.params.sport);
	// data-sport on the wrapper switches the accent color (see layout.css).
	// Pages without a sport use volleyball's teal as the brand color.
	let sport = $derived(pageSport ?? 'volleyball');

	// Home › Volleyball › NCAA, built from the URL. None on the home page or error pages.
	// $derived.by takes a function, for derived values that need more than one expression.
	let crumbs = $derived.by((): Crumb[] => {
		const { sport, league } = page.params;
		if (!sport || page.error) return [];

		const items: Crumb[] = [{ label: 'Home', href: '/' }];
		items.push({ label: sportName(sport), href: league ? `/${sport}` : undefined });
		if (league) items.push({ label: leagueName(league) });
		return items;
	});
</script>

<svelte:head>
	<!-- Files in static/ are served from the site root, so they're linked by URL, not imported. -->
	<link rel="icon" href="/ollie_toon.ico" />
	<title>SheRules: women's sports rules, in plain language</title>
</svelte:head>

<!-- Sets class="dark" on <html> from the saved choice or the system setting (default).
     Its first-paint script lives in app.html (with a CSP nonce), so it isn't injected here. -->
<ModeWatcher disableHeadScriptInjection />

<div data-sport={sport} class="relative min-h-screen bg-background text-foreground">
	<!-- The glow and drifting ball sit behind the header too, so the hero starts at the very top. -->
	<div aria-hidden="true" class="pointer-events-none absolute inset-x-0 top-0 h-120 overflow-hidden">
		<div class="hero-glow absolute inset-0"></div>
		<div class="relative mx-auto h-full max-w-3xl">
			<HeroDecor sport={pageSport} />
		</div>
	</div>

	<header class="relative mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
		<a href="/" class="group flex items-center gap-[0.35em] font-display text-2xl font-black tracking-tight sm:text-3xl">
			<!-- The logo mark is the current sport's ball, or a referee's whistle off sport pages.
			     Sized in em, so it grows and shrinks with the wordmark. -->
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
		{@render children()}
	</main>
</div>
