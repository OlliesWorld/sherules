<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import LeaguePicker from '#lib/components/LeaguePicker.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { recallLeague } from '#lib/last-league.ts';
	import { sportName } from '#lib/labels.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// A returning visitor goes straight to the league they used last, still with the picker to switch.
	onMount(() => {
		const saved = recallLeague(data.sport);
		if (saved && data.leagues.some(({ league }) => league === saved)) {
			goto(`/${data.sport}/${saved}`, { replaceState: true });
		}
	});
</script>

<svelte:head>
	<title>{sportName(data.sport)} rules · SheRules</title>
</svelte:head>

<div class="motion-stagger">
	<h1 class="font-display text-3xl font-black tracking-tight sm:text-4xl">
		{sportName(data.sport)}
	</h1>
	<p class="mt-1 text-sm font-medium text-muted-foreground">
		Pick a league to get answers from its rulebook
	</p>
</div>

<LeaguePicker sport={data.sport} leagues={data.leagues} />

<!-- The real question box is on the league page: the league decides which rulebook answers. -->
<div class="mt-3 flex gap-2">
	<label for="question" class="sr-only">Ask a rules question</label>
	<Input
		id="question"
		disabled
		placeholder="Pick a league to ask…"
		class="h-auto min-w-0 flex-1 rounded-full bg-card px-4 py-3 text-base disabled:bg-muted disabled:opacity-100 md:text-base"
	/>
	<Button disabled class="h-auto rounded-full bg-sport px-5 font-bold text-sport-foreground disabled:opacity-60">
		Ask
	</Button>
</div>
