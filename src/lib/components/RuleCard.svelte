<script lang="ts">
	import type { Citation } from '#lib/server/rag.ts';

	// One cited rule: the big rule number, the rule text, and a link to the PDF page.
	let { citation }: { citation: Citation } = $props();

	// "Rule 11.3.2" -> "11.3.2" for the big number.
	let shortRef = $derived(citation.ruleRef.replace(/^Rule /, ''));
	// Interpretation refs ("13, Situation 1") are longer, so they get a smaller size.
	let isNumber = $derived(/^[\d.]+$/.test(shortRef));
</script>

<a
	href={citation.url}
	target="_blank"
	rel="noopener"
	aria-label="Open {citation.ruleRef} in the {citation.sourceName}, page {citation.page}"
	class="rule-card motion-rule group block rounded-xl border border-transparent p-5"
>
	<p class="font-mono font-bold text-sport {isNumber ? 'text-4xl' : 'text-2xl'}">{shortRef}</p>
	<blockquote class="mt-2 line-clamp-4 text-[15px] whitespace-pre-line italic">
		"{citation.excerpt}"
	</blockquote>
	<span
		class="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/60 pt-3 text-sm"
	>
		<span class="calm-link font-medium text-muted-foreground group-hover:text-foreground">
			{citation.sourceName}, p. {citation.page}
		</span>
		<span class="inline-flex items-center gap-1.5 font-bold text-sport">
			Open source
			<svg
				viewBox="0 0 16 16"
				class="h-4 w-4 transition-transform group-hover:translate-x-1"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M2 8h11M9 4l4 4-4 4" />
			</svg>
		</span>
	</span>
</a>
