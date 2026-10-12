<script lang="ts">
	import SportIcon from './SportIcon.svelte';

	// The soft glow and the big drifting ball at the top of every page. Purely decorative.
	// Positioned against the content column in +layout.svelte.
	// Without a sport (home page), only the glow shows.
	let { sport }: { sport?: string } = $props();
</script>

<div
	aria-hidden="true"
	class="calm-halo pointer-events-none absolute -top-16 -left-16 h-72 w-72 rounded-full sm:h-96 sm:w-96"
></div>
{#if sport}
	<SportIcon
		{sport}
		class="motion-ball pointer-events-none absolute top-16 -right-10 h-48 w-48 text-sport opacity-15 sm:h-64 sm:w-64"
	/>
{/if}
