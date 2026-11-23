<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	// 404s (a sport with no rulebook), and 503 when the app can't reach the website (offline).
	let offline = $derived(page.status === 503);
</script>

<div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
	<p class="font-display text-7xl font-black">{offline ? 'Offline' : page.status}</p>
	<h1 class="mt-4 text-xl font-semibold">
		{offline ? "Can't reach SheRules" : page.status === 404 ? 'Page not found' : 'Something went wrong'}
	</h1>
	<p class="mt-2 text-sm text-muted-foreground">
		{offline
			? 'Check your connection and try again.'
			: (page.error?.message ?? "The page you're looking for doesn't exist or has been moved.")}
	</p>
	<div class="mt-6 flex gap-2">
		{#if page.status !== 404}
			<Button onclick={() => goto(page.url.href, { invalidateAll: true })}>Try again</Button>
		{/if}
		<Button href="/" variant={page.status === 404 ? 'default' : 'outline'}>Go home</Button>
	</div>
</div>
