<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import RuleCard from '#lib/components/RuleCard.svelte';
	import SportIcon from '#lib/components/SportIcon.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { exampleQuestions, leagueName, sportName } from '#lib/labels.ts';
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
	let examples = $derived(exampleQuestions(data.sport));
	let sourceName = $derived(data.sources[0]?.name ?? '');
	// asksLeft is null when there's no daily limit (local development).
	let outOfAsks = $derived(data.asksLeft === 0);

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
	<title>{leagueName(data.league)} {sportName(data.sport)} rules · SheRules</title>
</svelte:head>

<!-- A snippet is a reusable chunk of markup, like a small inline component. -->
{#snippet exampleChips()}
	<ul class="motion-stagger flex flex-wrap gap-2">
		{#each examples as example (example)}
			<li>
				<button
					type="button"
					onclick={() => ask(example)}
					class="motion-choice inline-flex items-center rounded-full border bg-card px-3.5 py-2 text-left text-sm font-medium hover:border-sport hover:bg-sport-soft"
				>
					{example}
				</button>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet limitCard()}
	<div class="rounded-xl bg-muted p-6">
		<p class="text-lg font-bold">That's your {data.asksPerDay} questions for today.</p>
		<p class="mt-2 text-muted-foreground">
			Each visitor gets {data.asksPerDay} free questions a day. Come back tomorrow for more.
		</p>
	</div>
{/snippet}

<div class="motion-stagger">
	<h1 class="font-display text-3xl font-black tracking-tight sm:text-4xl">
		{leagueName(data.league)}
		{sportName(data.sport)}
	</h1>
	<p class="mt-1 text-sm font-medium text-muted-foreground">
		Answers from the {seasons}
		{leagueName(data.league)} rulebook
	</p>
</div>

<form
	bind:this={formElement}
	method="POST"
	action="?/ask"
	use:enhance={handleAsk}
	class="mt-6 flex gap-2"
>
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

{#if data.asksLeft !== null}
	<p class="mt-2 pl-4 text-xs text-muted-foreground">
		{data.asksLeft} of {data.asksPerDay} free questions left today
	</p>
{/if}

<!-- aria-live announces new content to screen readers when the answer arrives. -->
<section aria-live="polite" class="page-enter mt-8">
	{#if asking}
		<div class="py-6" role="status">
			<p class="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
				<SportIcon sport={data.sport} class="motion-nudge h-5 w-5 text-sport" />
				Checking the rulebook…
			</p>
			<div class="space-y-3">
				<div class="calm-line h-0.5 w-full bg-sport"></div>
				<div class="calm-line h-0.5 w-[85%] bg-sport"></div>
				<div class="calm-line h-0.5 w-[60%] bg-sport"></div>
			</div>
		</div>
	{:else if form?.limitReached}
		{@render limitCard()}
	{:else if form?.error}
		<div class="rounded-lg border border-destructive/40 p-6" role="alert">
			<p class="font-bold">Something went wrong on our end.</p>
			<p class="mt-1 text-muted-foreground">{form.error} Your question is still here.</p>
			<Button variant="outline" class="motion-choice mt-4" onclick={() => ask(question)}>
				Try again
			</Button>
		</div>
	{:else if form?.result && !form.result.found}
		<div class="rounded-xl bg-muted p-6">
			<p class="text-lg font-bold">I can't find that in the rulebook.</p>
			<p class="mt-2 text-muted-foreground">
				Try fewer words, or name the moment you saw, like "ball hits the net on a serve." Here are some
				that work:
			</p>
			{#if !outOfAsks}
				<div class="mt-4">{@render exampleChips()}</div>
			{/if}
		</div>
	{:else if form?.result}
		{@const result = form.result}
		<article>
			<p class="text-xs font-bold tracking-widest text-muted-foreground uppercase">You asked</p>
			<h2 class="mt-1 text-xl font-bold">{form.question}</h2>

			<div class="motion-stagger mt-4 space-y-3 text-[17px] leading-relaxed">
				{#each result.answer.split(/\n+/) as paragraph, i (i)}
					<p>{paragraph}</p>
				{/each}
			</div>

			<h3 class="mt-8 mb-3 text-xs font-bold tracking-widest text-muted-foreground uppercase">
				From the rulebook{result.citations.length > 1 ? ` · ${result.citations.length} rules` : ''}
			</h3>
			<div class="motion-stagger space-y-3">
				{#each result.citations as citation (citation.ruleRef)}
					<RuleCard {citation} />
				{/each}
			</div>

			<!-- For checking retrieval while we tune it. <details> is a native show/hide toggle. -->
			<details class="mt-8 text-sm text-muted-foreground">
				<summary class="cursor-pointer font-medium hover:text-foreground">
					Show the {result.excerpts.length} excerpts this answer was based on
				</summary>
				<ul class="mt-3 space-y-3">
					{#each result.excerpts as excerpt (excerpt.id)}
						<li class="rounded-lg border p-4">
							<p class="flex flex-wrap items-baseline gap-x-3">
								<a href={excerpt.url} target="_blank" rel="noopener" class="font-mono font-bold text-sport">
									{excerpt.ruleRef}
								</a>
								<span>{excerpt.type} · distance {excerpt.distance.toFixed(3)}</span>
							</p>
							<p class="mt-1 text-xs">{excerpt.headingPath}</p>
							<p class="mt-2 whitespace-pre-line text-foreground/80">{excerpt.text}</p>
						</li>
					{/each}
				</ul>
			</details>
		</article>
	{:else if outOfAsks}
		{@render limitCard()}
	{:else}
		<h2 class="mb-3 text-xs font-bold tracking-widest text-muted-foreground uppercase">Try asking</h2>
		{@render exampleChips()}
	{/if}
</section>

{#if sourceName}
	<p class="mt-12 text-xs text-muted-foreground">
		Sources:
		{#each data.sources as source, i (source.id)}
			{#if i > 0},{/if}
			<a href={source.url} target="_blank" rel="noopener" class="calm-link hover:text-foreground">{source.name}</a>
		{/each}
	</p>
{/if}
