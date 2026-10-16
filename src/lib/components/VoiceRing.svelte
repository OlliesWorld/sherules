<script lang="ts">
	import MicIcon from '@lucide/svelte/icons/mic';
	import MicOffIcon from '@lucide/svelte/icons/mic-off';

	// The mic badge shown during a voice call, with a thin ring that drains as time runs out.
	// In the last stretch (warning) the ring turns amber and pulses softly.
	let {
		remaining,
		warning = false,
		micOff = false,
		label
	}: {
		/** Share of the call left, from 1 (full ring) to 0 (empty). */
		remaining: number;
		warning?: boolean;
		/** Shows a crossed-out mic, e.g. while the agent wraps up after time runs out. */
		micOff?: boolean;
		/** Read out by screen readers, e.g. "2:13 left". */
		label: string;
	} = $props();

	const RADIUS = 21;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
	// An empty ring is a fully offset stroke; a full ring has no offset.
	let offset = $derived(CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, remaining))));
</script>

<span class="relative inline-flex size-12 shrink-0 items-center justify-center" role="img" aria-label={label}>
	<svg viewBox="0 0 48 48" class="absolute inset-0 size-full -rotate-90" aria-hidden="true">
		<!-- Track: the faint full circle the ring drains along. -->
		<circle cx="24" cy="24" r={RADIUS} fill="none" stroke-width="3" class="stroke-border" />
		<!-- The time left. Drains clockwise from the top; the 1s transition matches the 1s tick. -->
		<circle
			cx="24"
			cy="24"
			r={RADIUS}
			fill="none"
			stroke-width="3"
			stroke-linecap="round"
			stroke-dasharray={CIRCUMFERENCE}
			stroke-dashoffset={offset}
			class="ring-progress {warning ? 'stroke-voice-warning motion-safe:animate-pulse' : 'stroke-sport'}"
		/>
	</svg>
	<span class="flex size-9 items-center justify-center rounded-full bg-sport-soft {warning ? 'text-voice-warning' : 'text-sport'}">
		{#if micOff}
			<MicOffIcon class="size-4" aria-hidden="true" />
		{:else}
			<MicIcon class="size-4" aria-hidden="true" />
		{/if}
	</span>
</span>

<style>
	.ring-progress {
		transition:
			stroke-dashoffset 1s linear,
			stroke 0.6s ease;
	}

	@media (prefers-reduced-motion: reduce) {
		.ring-progress {
			transition: none;
		}
	}
</style>
