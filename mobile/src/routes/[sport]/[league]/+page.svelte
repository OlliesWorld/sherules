<script lang="ts">
	import { tick } from 'svelte';
	import AnswerPanel from '#lib/components/AnswerPanel.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { exampleQuestions, pageHeading, rulebookLabel, rulebookNote } from '#lib/labels.ts';
	import type { AskOutcome } from '#lib/types.ts';
	import { ask as askApi } from '#mobile/api.ts';
	import type { PageProps } from './$types';

	// The website's league page (src/routes/[sport]/[league]/+page.svelte), for the app.
	// Voice isn't in the app yet, so there's no mic button.
	let { data }: PageProps = $props();

	let asking = $state(false);
	let question = $state('');
	let outcome = $state<AskOutcome | null>(null);
	let formElement: HTMLFormElement;

	let seasons = $derived([...new Set(data.sources.map((source) => source.season))].join(', '));
	let sourceName = $derived(data.sources[0]?.name ?? '');
	let note = $derived(rulebookNote(data.sport, data.league));
	// After an answer, its count is the newest. null = no daily limit shown.
	let asksLeft = $derived(outcome?.asksLeft !== undefined ? outcome.asksLeft : data.asksLeft);
	let outOfAsks = $derived(asksLeft === 0);

	async function submitQuestion(event: SubmitEvent) {
		event.preventDefault();
		if (asking) return;
		asking = true;
		outcome = await askApi({ sport: data.sport, league: data.league, question });
		asking = false;
	}

	// Example chips and "Try again" fill in the question, then submit the form.
	async function ask(text: string) {
		question = text;
		await tick();
		formElement.requestSubmit();
	}
</script>

<svelte:head>
	<title>{pageHeading(data.sport, data.league)} rules · SheRules</title>
</svelte:head>

<div class="motion-stagger">
	<h1 class="font-display text-3xl font-black tracking-tight sm:text-4xl">
		{pageHeading(data.sport, data.league)}
	</h1>
	<p class="mt-1 text-sm font-medium text-muted-foreground">
		Answers from {rulebookLabel(data.sport, data.league, seasons)}
	</p>
	{#if note}
		<p class="mt-1 text-xs text-muted-foreground">{note}</p>
	{/if}
</div>

<form bind:this={formElement} onsubmit={submitQuestion} class="mt-6 flex gap-2">
	<label for="question" class="sr-only">Ask a rules question</label>
	<Input
		id="question"
		name="question"
		bind:value={question}
		placeholder="Ask a rules question…"
		maxlength={500}
		required
		disabled={outOfAsks}
		autocomplete="off"
		class="h-auto min-w-0 flex-1 rounded-full bg-card px-4 py-3 text-base focus-visible:border-sport focus-visible:ring-sport-soft md:text-base"
	/>
	<Button
		type="submit"
		disabled={asking || outOfAsks}
		class="motion-submit h-auto rounded-full bg-sport px-5 font-bold text-sport-foreground hover:bg-sport/90 disabled:opacity-60"
	>
		Ask
	</Button>
</form>

<p class="mt-2 pl-4 text-xs text-muted-foreground">
	{#if asksLeft != null}{asksLeft} of {data.asksPerDay} free questions left today ·{/if}
	Questions are saved anonymously to improve answers.
</p>

<AnswerPanel
	sport={data.sport}
	{asking}
	{outcome}
	asksPerDay={data.asksPerDay}
	{outOfAsks}
	examples={exampleQuestions(data.sport)}
	onAsk={ask}
/>

{#if sourceName}
	<p class="mt-12 text-xs text-muted-foreground">
		Sources:
		{#each data.sources as source, i (source.id)}
			{#if i > 0},{/if}
			<a href={source.url} target="_blank" rel="noopener" class="calm-link hover:text-foreground">{source.name}</a>
		{/each}
	</p>
{/if}
