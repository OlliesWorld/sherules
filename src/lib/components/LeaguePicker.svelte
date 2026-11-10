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
		<!-- Each league is underlined; the picked one gets a thicker line in the sport's color. -->
		<ul class="flex flex-wrap gap-x-5 gap-y-1">
			{#each leagues as { league } (league)}
				<li>
					<a
						href="/{sport}/{league}"
						data-sveltekit-replacestate
						aria-current={league === current ? 'page' : undefined}
						class="inline-flex min-h-10 items-center px-1 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sport {league ===
						current
							? 'border-b-[3px] border-sport text-sport'
							: current
								? 'border-b-[3px] border-border text-muted-foreground hover:border-sport/50 hover:text-foreground'
								: 'border-b-[3px] border-sport/40 text-foreground hover:border-sport'}"
					>
						{leagueName(league)}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}
