<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import AnswerPanel from '#lib/components/AnswerPanel.svelte';
	import VoiceAgent from '#lib/components/VoiceAgent.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { exampleQuestions, pageHeading, rulebookLabel, rulebookNote } from '#lib/labels.ts';
	import type { PageProps } from './$types';

	// `form` holds whatever the `ask` action returned (or passed to fail()).
	let { data, form }: PageProps = $props();

	// $state is Svelte's useState: assigning to it re-renders whatever reads it.
	let asking = $state(false);
	// Starts from the last submitted question so it survives a no-JavaScript form post.
	// untrack() says we only want form's value right now, not to follow later changes.
	let question = $state(untrack(() => form?.question ?? ''));
	// bind:this gives us the <form> element, like a React ref.
	let formElement: HTMLFormElement;

	// $derived recomputes when what it reads changes, like useMemo without a dependency list.
	let seasons = $derived([...new Set(data.sources.map((source) => source.season))].join(', '));
	let sourceName = $derived(data.sources[0]?.name ?? '');
	let note = $derived(rulebookNote(data.sport, data.league));
	// After an answer, the action's count is the newest. null = no daily limit (local development).
	let asksLeft = $derived(form && 'asksLeft' in form ? form.asksLeft : data.asksLeft);
	let outOfAsks = $derived(asksLeft === 0);

	// use:enhance submits the form with fetch instead of a full page load.
	// Returning a callback lets us run code when the response arrives.
	const handleAsk: SubmitFunction = () => {
		asking = true;
		return async ({ update }) => {
			await update({ reset: false }); // keep the question in the box
			asking = false;
		};
	};

	// Example chips and "Try again" fill in the question, then submit the same form.
	async function ask(text: string) {
		question = text;
		await tick(); // wait for Svelte to write the new value into the input
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

<form bind:this={formElement} method="POST" action="?/ask" use:enhance={handleAsk} class="mt-6 flex gap-2">
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

{#if data.voiceEnabled}
	<VoiceAgent sport={data.sport} league={data.league} />
{/if}

<AnswerPanel
	sport={data.sport}
	{asking}
	outcome={form}
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
