<script lang="ts">
	import { tick } from 'svelte';
	import AnswerPanel from '#lib/components/AnswerPanel.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { exampleQuestions, leagueName, rulebookLabel, rulebookNote, sportName } from '#lib/labels.ts';
	import type { AskOutcome } from '#lib/types.ts';
	import { ask as askApi } from '#mobile/api.ts';
	import type { PageProps } from './$types';

	// The website's sport page (src/routes/[sport]/+page.svelte), for the app: the same
	// markup, but questions go to POST /api/v1/ask and the result lives in `outcome`
	// instead of the form action's `form`. The server works out the league, or asks.
	let { data }: PageProps = $props();

	let asking = $state(false);
	let question = $state('');
	let outcome = $state<AskOutcome | null>(null);
	let formElement: HTMLFormElement;

	let answeredLeague = $derived(outcome?.league);
	let asksLeft = $derived(outcome?.asksLeft ?? null);
	let outOfAsks = $derived(asksLeft === 0 || outcome?.limitReached === true);
	let chooseFrom = $derived(outcome?.chooseFrom);
	let elsewhere = $derived(outcome?.elsewhere ?? []);

	async function send(input: { question: string; league?: string; previousLeague?: string }) {
		if (asking) return;
		asking = true;
		outcome = await askApi({ sport: data.sport, ...input });
		asking = false;
	}

	// The question box. A follow-up that names no league stays with the last answer's league.
	function submitQuestion(event: SubmitEvent) {
		event.preventDefault();
		send({ question, previousLeague: answeredLeague });
	}

	// "Which league?" and "Ask X instead": the same question, from that league's rulebook.
	function askLeague(league: string) {
		send({ question: outcome?.question ?? question, league });
	}

	// Example chips and "Try again" fill in the question, then submit the form.
	async function ask(text: string) {
		question = text;
		await tick();
		formElement.requestSubmit();
	}

	const seasonOf = (league: string) => data.leagues.find((l) => l.league === league)?.season ?? '';
</script>

<svelte:head>
	<title>{sportName(data.sport)} rules · SheRules</title>
</svelte:head>

<!-- Buttons that ask the current question again from one league's rulebook. -->
{#snippet askIn(leagues: string[], label: (league: string) => string)}
	<div class="mt-3 flex flex-wrap gap-2">
		{#each leagues as league (league)}
			<Button
				type="button"
				onclick={() => askLeague(league)}
				variant="outline"
				disabled={asking}
				class="motion-choice rounded-full font-bold hover:border-sport hover:bg-sport-soft"
			>
				{label(league)}
			</Button>
		{/each}
	</div>
{/snippet}

{#snippet whichLeague()}
	<div class="rounded-xl bg-muted p-6">
		<p class="text-lg font-bold">Which league?</p>
		<p class="mt-1 text-muted-foreground">
			{chooseFrom && chooseFrom.length < data.leagues.length
				? 'Your question mentions more than one. Pick one to start.'
				: 'Each league has its own rulebook, and they differ on details.'}
		</p>
		{@render askIn(chooseFrom ?? [], leagueName)}
	</div>
{/snippet}

{#snippet answeredFrom()}
	{#if answeredLeague}
		{@const note = rulebookNote(data.sport, answeredLeague)}
		<div class="mt-3 mb-4 text-sm text-muted-foreground">
			<p class="flex flex-wrap items-center gap-x-2 gap-y-1">
				<span class="rounded-full bg-sport px-2.5 py-0.5 text-xs font-black tracking-wide text-sport-foreground uppercase">
					{leagueName(answeredLeague)} rule
				</span>
				<span>from {rulebookLabel(data.sport, answeredLeague, seasonOf(answeredLeague))}</span>
			</p>
			{#if note}<p class="mt-1 text-xs">{note}</p>{/if}
		</div>
	{/if}
{/snippet}

<!-- Under the answer: how other leagues differ on this question (verified glossary notes,
     e.g. "NCAA has no Reset"), and a one-tap way to ask another league's rulebook. -->
{#snippet afterAnswer()}
	{#if answeredLeague}
		<div class="mt-5 text-sm text-muted-foreground">
			{#each elsewhere as { league, note } (league + note)}
				<p class="mb-3 border-l-[3px] border-sport/50 pl-3 text-foreground/85">
					<span class="font-bold text-foreground">{leagueName(league)}:</span>
					{note}
				</p>
			{/each}
			{#if !outOfAsks}
				{@render askIn(
					data.leagues.map(({ league }) => league).filter((league) => league !== answeredLeague),
					(league) => `Ask ${leagueName(league)} instead`
				)}
			{/if}
		</div>
	{/if}
{/snippet}

<div class="motion-stagger">
	<h1 class="font-display text-3xl font-black tracking-tight sm:text-4xl">
		{sportName(data.sport)}
	</h1>
	<p class="mt-1 text-sm font-medium text-muted-foreground">
		Name the league ({data.leagues.map(({ league }) => leagueName(league)).join(', ')}) if you know it, or
		we'll ask.
	</p>
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
	{answeredFrom}
	{afterAnswer}
	idle={chooseFrom ? whichLeague : undefined}
/>
