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
		{#if sport === 'rugby'}
			<!-- An oval ball on a diagonal, with a seam and three laces across it. -->
			<g transform="rotate(-45 16 16)">
				<ellipse cx="16" cy="16" rx="13" ry="7.5" />
				<path d="M11 16h10M13 14.4v3.2M16 14.4v3.2M19 14.4v3.2" />
			</g>
		{:else}
			<circle cx="16" cy="16" r="12" />
			{#if sport === 'basketball'}
				<path d="M4 16h24M16 4v24" />
				<path d="M7 7.5c4 2.5 4 14.5 0 17M25 7.5c-4 2.5-4 14.5 0 17" />
			{:else if sport === 'soccer'}
				<!-- A filled center patch with seams running out to the edge. -->
				<path d="M16 11.5l4.28 3.11-1.63 5.03h-5.3l-1.63-5.03z" fill="currentColor" />
				<path d="M16 11.5V4M20.28 14.61l7.13-2.32M18.65 19.64l4.4 6.07M13.35 19.64l-4.4 6.07M11.72 14.61l-7.13-2.32" />
			{:else}
				<path d="M16 4v24M4 16h24" />
			{/if}
		{/if}
	</svg>
{/if}
