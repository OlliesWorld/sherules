<script lang="ts">
	import { leagueName } from '#lib/labels.ts';

	// `current` is unset on the sport page, where no league has been picked yet.
	let {
		sport,
		leagues,
		current
	}: { sport: string; leagues: { league: string }[]; current?: string } = $props();
</script>

<!-- Nothing to choose when a sport has one league (rugby).
     replacestate: Back leaves the sport instead of stepping through each league tapped. -->
{#if leagues.length > 1}
	<nav aria-label="League" class="mt-5">
		<ul class="flex flex-wrap gap-2">
			{#each leagues as { league } (league)}
				<li>
					<a
						href="/{sport}/{league}"
						data-sveltekit-replacestate
						aria-current={league === current ? 'page' : undefined}
						class="motion-choice inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sport {league ===
						current
							? 'border-sport bg-sport text-sport-foreground'
							: 'bg-card hover:bg-sport-soft'}"
					>
						{leagueName(league)}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}
