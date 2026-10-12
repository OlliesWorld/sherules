<script lang="ts">
	// SheRules' referee-whistle mark, used as the logo off sport pages.
	// Original drawing (same 32px grid and 1.5 stroke as SportIcon). Uses currentColor.
	let { class: className = '' }: { class?: string } = $props();
</script>

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
	<g transform="translate(-0.5 3.5)">
		<!-- Whistle, tilted slightly: mouthpiece, its open end, the top slot, and the chamber's ball. -->
		<g transform="rotate(-14 16 18)">
			<path d="M21 13H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h9.07A7 7 0 1 0 21 13Z" />
			<path d="M7 13v6" />
			<path d="M15 13v-1.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V13" />
			<circle cx="21" cy="20" r="2.75" />
		</g>
		<!-- Sound lines. -->
		<path d="M22 5.5l.7-3M26 7.5l2.4-2.2M28 11.5l3-.7" />
	</g>
</svg>
