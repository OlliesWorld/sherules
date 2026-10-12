<script lang="ts">
	import SportIcon from '#lib/components/SportIcon.svelte';
	import { sportName } from '#lib/labels.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<section class="pt-10 pb-12 sm:pt-14">
	<div class="motion-stagger">
		<p
			class="mb-4 inline-block rounded-full bg-sport-soft px-3 py-1 text-xs font-bold tracking-widest text-sport uppercase"
		>
			Women's sports, decoded
		</p>
		<h1 class="max-w-xl font-display text-5xl leading-[1.05] font-black tracking-tight sm:text-6xl">
			Saw a call you <span class="text-sport">didn't get?</span>
		</h1>
		<p class="mt-4 max-w-md text-lg font-medium text-muted-foreground">
			Ask any rules question about women's sports. Get a plain answer, straight from the rulebook.
		</p>
	</div>
</section>

<h2 class="mb-3 text-xs font-extrabold tracking-widest text-muted-foreground uppercase">Pick a sport</h2>

{#if data.sports.length === 0}
	<p class="rounded-lg border border-dashed p-5 text-muted-foreground">
		No rulebooks loaded yet. Run <code class="font-mono">npm run ingest</code> first.
	</p>
{:else}
	<ul class="motion-stagger grid grid-cols-2 gap-3 sm:grid-cols-3">
		{#each data.sports as sport (sport)}
			<!-- Each tile sets its own data-sport, so it shows that sport's accent. -->
			<li data-sport={sport}>
				<a
					href="/{sport}"
					class="motion-choice flex h-full flex-col gap-6 rounded-lg border bg-card p-4 hover:bg-sport-soft"
				>
					<SportIcon {sport} class="h-9 w-9 text-sport" />
					<span class="font-display text-lg font-extrabold">{sportName(sport)}</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}
