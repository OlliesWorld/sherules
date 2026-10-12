<script lang="ts">
	import VolleyballIcon from '@lucide/svelte/icons/volleyball';

	// Line-drawn ball for each sport. Uses currentColor, so set the color with a text-* class.
	let { sport, class: className = '' }: { sport: string; class?: string } = $props();
</script>

{#if sport === 'volleyball'}
	<!-- Lucide's volleyball: the classic three-panel ball. -->
	<VolleyballIcon class={className} strokeWidth={1.5} aria-hidden="true" />
{:else}
	<svg
		viewBox="0 0 32 32"
		class={className}
		aria-hidden="true"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<circle cx="16" cy="16" r="12" />
		{#if sport === 'basketball'}
			<path d="M4 16h24M16 4v24" />
			<path d="M7 7.5c4 2.5 4 14.5 0 17M25 7.5c-4 2.5-4 14.5 0 17" />
		{:else}
			<path d="M16 4v24M4 16h24" />
		{/if}
	</svg>
{/if}
