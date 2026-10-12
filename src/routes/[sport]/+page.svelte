<script lang="ts">
	import { leagueLevel, leagueName, sportName } from '#lib/labels.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{sportName(data.sport)} rules · SheRules</title>
</svelte:head>

<h1 class="mb-10 font-display text-4xl font-black tracking-tight sm:text-5xl">
	{sportName(data.sport)}
</h1>

<h2 class="mb-3 text-xs font-extrabold tracking-widest text-muted-foreground uppercase">Choose a league</h2>

<ul class="motion-stagger space-y-3">
	{#each data.leagues as { league, season } (league)}
		<li>
			<a
				href="/{data.sport}/{league}"
				class="motion-choice flex items-center justify-between rounded-lg border bg-card p-5 hover:bg-sport-soft"
			>
				<span>
					<span class="block text-lg font-bold">{leagueName(league)}</span>
					<span class="text-sm text-muted-foreground">
						{[leagueLevel(league), `${season} rulebook`].filter(Boolean).join(' · ')}
					</span>
				</span>
				<span class="text-sport" aria-hidden="true">→</span>
			</a>
		</li>
	{/each}
</ul>
