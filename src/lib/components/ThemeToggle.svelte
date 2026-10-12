<script lang="ts">
	import { mode, toggleMode } from 'mode-watcher';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { Button } from '#lib/components/ui/button/index.ts';

	// mode.current is 'light' or 'dark' (what's showing now, including the system default).
	let nextMode = $derived(mode.current === 'dark' ? 'light' : 'dark');
</script>

<Button
	variant="ghost"
	size="icon"
	onclick={toggleMode}
	aria-label="Switch to {nextMode} theme"
	title="Switch to {nextMode} theme"
	class="rounded-full text-muted-foreground hover:text-foreground"
>
	<!-- Both icons render; CSS shows the right one, so there's no flicker before JS loads. -->
	<SunIcon class="hidden size-5 dark:block" />
	<MoonIcon class="size-5 dark:hidden" />
</Button>
