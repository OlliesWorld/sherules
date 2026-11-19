<script lang="ts" module>
	// Type-only import: nothing from the server module reaches the browser.
	import type { RulebookAnswer } from '#lib/server/rag.ts';

	/** What an `ask` action returned (or passed to fail()). */
	export interface AskOutcome {
		question?: string;
		error?: string;
		limitReached?: boolean;
		atCapacity?: boolean;
		result?: RulebookAnswer;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import RuleCard from '#lib/components/RuleCard.svelte';
	import SportIcon from '#lib/components/SportIcon.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';

	// The answer area under the question box, shared by the sport page and the league pages.
	let {
		sport,
		asking,
		outcome,
		asksPerDay,
		outOfAsks,
		examples,
		onAsk,
		answeredFrom,
		afterAnswer,
		idle
	}: {
		sport: string;
		asking: boolean;
		outcome: AskOutcome | null | undefined;
		asksPerDay: number;
		outOfAsks: boolean;
		examples: string[];
		/** Fills in the question box and submits it (example chips, "Try again"). */
		onAsk: (question: string) => void;
		/** Shown above the answer, e.g. which league's rulebook answered. */
		answeredFrom?: Snippet;
		/** Shown right under the answer, before the rule cards, e.g. how other leagues differ. */
		afterAnswer?: Snippet;
		/** Shown when there's nothing else to show. Defaults to the example questions. */
		idle?: Snippet;
	} = $props();
</script>

<!-- A snippet is a reusable chunk of markup, like a small inline component. -->
{#snippet exampleChips()}
	<ul class="motion-stagger flex flex-wrap gap-2">
		{#each examples as example (example)}
			<li>
				<button
					type="button"
					onclick={() => onAsk(example)}
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
		<p class="text-lg font-bold">That's your {asksPerDay} questions for today.</p>
		<p class="mt-2 text-muted-foreground">
			Each visitor gets {asksPerDay} free questions a day. Come back tomorrow for more.
		</p>
	</div>
{/snippet}

<!-- aria-live announces new content to screen readers when the answer arrives. -->
<section aria-live="polite" class="page-enter mt-8">
	{#if asking}
		<div class="py-6" role="status">
			<p class="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
				<SportIcon {sport} class="motion-nudge h-5 w-5 text-sport" />
				Checking the rulebook…
			</p>
			<div class="space-y-3">
				<div class="calm-line h-0.5 w-full bg-sport"></div>
				<div class="calm-line h-0.5 w-[85%] bg-sport"></div>
				<div class="calm-line h-0.5 w-[60%] bg-sport"></div>
			</div>
		</div>
	{:else if outcome?.limitReached}
		{@render limitCard()}
	{:else if outcome?.atCapacity}
		<div class="rounded-xl bg-muted p-6">
			<p class="text-lg font-bold">We've answered all the questions we can for today.</p>
			<p class="mt-2 text-muted-foreground">
				SheRules has a daily limit across everyone. Please come back tomorrow.
			</p>
		</div>
	{:else if outcome?.error}
		<div class="rounded-lg border border-destructive/40 p-6" role="alert">
			<p class="font-bold">Something went wrong on our end.</p>
			<p class="mt-1 text-muted-foreground">{outcome.error} Your question is still here.</p>
			<Button variant="outline" class="motion-choice mt-4" onclick={() => onAsk(outcome.question ?? '')}>
				Try again
			</Button>
		</div>
	{:else if outcome?.result && !outcome.result.found}
		{@render answeredFrom?.()}
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
		{@render afterAnswer?.()}
	{:else if outcome?.result}
		{@const result = outcome.result}
		<article>
			<p class="text-xs font-bold tracking-widest text-muted-foreground uppercase">You asked</p>
			<h2 class="mt-1 text-xl font-bold">{outcome.question}</h2>
			{@render answeredFrom?.()}

			<div class="motion-stagger mt-4 space-y-3 text-[17px] leading-relaxed">
				{#each result.answer.split(/\n+/) as paragraph, i (i)}
					<p>{paragraph}</p>
				{/each}
			</div>
			{@render afterAnswer?.()}

			<h3 class="mt-8 mb-3 text-xs font-bold tracking-widest text-muted-foreground uppercase">
				From the rulebook{result.citations.length > 1 ? ` · ${result.citations.length} rules` : ''}
			</h3>
			<div class="motion-stagger space-y-3">
				{#each result.citations as citation (citation.ruleRef)}
					<RuleCard {citation} />
				{/each}
			</div>

			<!-- The rule text above is quoted from copyrighted rulebooks, so say whose it is. -->
			<p class="mt-4 text-xs leading-relaxed text-muted-foreground">
				Rule text quoted from the {[...new Set(result.citations.map((c) => c.sourceName))].join(' and the ')}
				for reference only. SheRules is not affiliated with or endorsed by its publisher. The official rulebook
				is the final word, so follow the link on each rule to read it in full.
			</p>

			<!-- For checking retrieval while we tune it. The server only sends excerpts in local
			     development (see server/ask.ts). <details> is a native show/hide toggle. -->
			{#if result.excerpts.length > 0}
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
			{/if}
		</article>
	{:else if outOfAsks}
		{@render limitCard()}
	{:else if idle}
		{@render idle()}
	{:else if examples.length > 0}
		<h2 class="mb-3 text-xs font-bold tracking-widest text-muted-foreground uppercase">Try asking</h2>
		{@render exampleChips()}
	{/if}
</section>
