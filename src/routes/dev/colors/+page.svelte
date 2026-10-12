<script lang="ts">
	import RuleCard from '#lib/components/RuleCard.svelte';
	import SportIcon from '#lib/components/SportIcon.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { sportName } from '#lib/labels.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Placeholder content: these are not real rules.
	const sampleCitation = {
		ruleRef: 'Rule 0.0.0',
		sourceName: 'Sample rulebook',
		url: '#',
		page: 0,
		excerpt: 'Sample rule text for comparing colors. Not from a real rulebook.'
	};
	const sampleInterpretation = { ...sampleCitation, ruleRef: 'Rule 0, Situation 0' };
</script>

<svelte:head>
	<title>Color check · SheRules</title>
</svelte:head>

<h1 class="mt-4 font-display text-3xl font-black tracking-tight">Sport colors</h1>
<p class="mt-1 text-sm text-muted-foreground">
	Dev only. Sample content, not real rules. Use the theme button in the header to compare light and
	dark.
</p>

<div class="mt-8 grid gap-6 md:-mx-24 md:grid-cols-2">
	{#each data.sports as sport (sport)}
		<!-- data-sport switches the accent for everything inside this column. -->
		<section data-sport={sport} class="space-y-5 rounded-2xl border p-5">
			<div class="flex items-center gap-3">
				<SportIcon {sport} class="h-9 w-9 text-sport" />
				<h2 class="font-display text-2xl font-black tracking-tight">NCAA {sportName(sport)}</h2>
			</div>

			<div class="flex gap-2">
				<Input
					placeholder="Ask a rules question…"
					class="h-auto min-w-0 flex-1 rounded-full bg-card px-4 py-3 text-base md:text-base"
				/>
				<Button
					class="motion-submit h-auto rounded-full bg-sport px-5 font-bold text-sport-foreground hover:bg-sport/90"
				>
					Ask
				</Button>
			</div>

			<div class="flex flex-wrap gap-2">
				<span class="rounded-full border bg-card px-3.5 py-2 text-sm font-medium">Example chip</span>
				<span class="rounded-full border border-sport bg-sport-soft px-3.5 py-2 text-sm font-medium">
					Chip on hover
				</span>
			</div>

			<p class="inline-block rounded-full bg-sport-soft px-3 py-1 text-xs font-bold tracking-widest text-sport uppercase">
				Badge
			</p>

			<div class="space-y-3">
				<RuleCard citation={sampleCitation} />
				<RuleCard citation={sampleInterpretation} />
			</div>

			<div class="flex flex-col gap-6 rounded-lg border bg-card p-4">
				<SportIcon {sport} class="h-9 w-9 text-sport" />
				<span class="font-display text-lg font-extrabold">{sportName(sport)} tile</span>
			</div>

			<div class="space-y-3">
				<div class="calm-line h-0.5 w-full bg-sport"></div>
				<div class="calm-line h-0.5 w-[60%] bg-sport"></div>
			</div>
		</section>
	{/each}
</div>
