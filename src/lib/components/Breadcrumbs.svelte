<!-- A `module` script runs once for the file, not per component, so types exported here can be imported elsewhere. -->
<script lang="ts" module>
	export interface Crumb {
		label: string;
		/** Omit for the current page (the last crumb). */
		href?: string;
	}
</script>

<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	let { items }: { items: Crumb[] } = $props();
</script>

<!-- A pill with a frosted background so it stays readable over the glow. -->
<nav aria-label="Breadcrumb">
	<ol
		class="inline-flex flex-wrap items-center gap-1 rounded-full border bg-card/70 px-2 py-1 text-[15px] font-semibold backdrop-blur"
	>
		{#each items as item, i (item.label)}
			<li class="flex items-center gap-1">
				{#if i > 0}
					<ChevronRightIcon class="size-4 text-muted-foreground" aria-hidden="true" />
				{/if}
				{#if item.href}
					<a
						href={item.href}
						class="rounded-full px-2.5 py-1 text-muted-foreground transition-colors hover:bg-sport-soft hover:text-foreground"
					>
						{item.label}
					</a>
				{:else}
					<span aria-current="page" class="px-2.5 py-1 text-sport">{item.label}</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
