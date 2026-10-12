<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.ts';
	import { page } from '$app/state';
</script>

<!-- Shown for 404s (e.g. a sport with no rulebook yet) and unexpected errors. -->
<div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
	<p class="font-display text-7xl font-black">{page.status}</p>
	<h1 class="mt-4 text-xl font-semibold">
		{page.status === 404 ? 'Page not found' : 'Something went wrong'}
	</h1>
	<p class="mt-2 text-sm text-muted-foreground">
		{page.error?.message ?? "The page you're looking for doesn't exist or has been moved."}
	</p>
	<Button href="/" class="mt-6">Go home</Button>
</div>
