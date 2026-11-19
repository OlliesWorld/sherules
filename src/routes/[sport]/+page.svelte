<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import AnswerPanel from '#lib/components/AnswerPanel.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { exampleQuestions, leagueName, rulebookLabel, rulebookNote, sportName } from '#lib/labels.ts';
	import type { PageProps } from './$types';

	// One question box for the whole sport. The server works out which league's rulebook
	// answers (see +page.server.ts) and asks "Which league?" when it can't tell.
	let { data, form }: PageProps = $props();

	let asking = $state(false);
	let question = $state(untrack(() => form?.question ?? ''));
	let formElement: HTMLFormElement;

	// The league that answered last. Sent with the next question, so a follow-up that names
	// no league stays with it instead of asking again.
	let answeredLeague = $derived(form && 'league' in form ? form.league : undefined);
	let asksLeft = $derived(form && 'asksLeft' in form ? form.asksLeft : null);
	let outOfAsks = $derived(asksLeft === 0 || (form != null && 'limitReached' in form));
	let chooseFrom = $derived(form && 'chooseFrom' in form ? form.chooseFrom : undefined);
	let elsewhere = $derived(form && 'elsewhere' in form ? form.elsewhere : []);

	const handleAsk: SubmitFunction = () => {
		asking = true;
		return async ({ update }) => {
			await update({ reset: false }); // keep the question in the box
			asking = false;
		};
	};

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

<!-- Buttons that ask the current question again from one league's rulebook. A form, so it
     works without JavaScript too. -->
{#snippet askIn(leagues: string[], label: (league: string) => string)}
	<form method="POST" action="?/ask" use:enhance={handleAsk} class="mt-3 flex flex-wrap gap-2">
		<input type="hidden" name="question" value={form?.question ?? question} />
		{#each leagues as league (league)}
			<Button
				type="submit"
				name="league"
				value={league}
				variant="outline"
				disabled={asking}
				class="motion-choice rounded-full font-bold hover:border-sport hover:bg-sport-soft"
			>
				{label(league)}
			</Button>
		{/each}
	</form>
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

<form bind:this={formElement} method="POST" action="?/ask" use:enhance={handleAsk} class="mt-6 flex gap-2">
	<label for="question" class="sr-only">Ask a rules question</label>
	{#if answeredLeague}<input type="hidden" name="previousLeague" value={answeredLeague} />{/if}
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
	outcome={form}
	asksPerDay={data.asksPerDay}
	{outOfAsks}
	examples={exampleQuestions(data.sport)}
	onAsk={ask}
	{answeredFrom}
	{afterAnswer}
	idle={chooseFrom ? whichLeague : undefined}
/>
