<script lang="ts">
	import { onDestroy } from 'svelte';
	import MicIcon from '@lucide/svelte/icons/mic';
	import PhoneOffIcon from '@lucide/svelte/icons/phone-off';
	import Volume2Icon from '@lucide/svelte/icons/volume-2';
	import { Button } from '#lib/components/ui/button/index.ts';
	import type { Room } from 'livekit-client';

	// "Ask by voice": talk to the SheRules voice agent (LiveKit) from the league page.
	// 1. Ask our server for a token (POST /api/voice/token), which also applies the daily limits
	// 2. Join the private LiveKit room with the microphone on; the agent joins and answers
	// 3. Hang up after the time limit, when the visitor taps End, or when leaving the page
	let { sport, league }: { sport: string; league: string } = $props();

	type Status = 'idle' | 'connecting' | 'live';
	let status = $state<Status>('idle');
	// The agent's state, from its 'lk.agent.state' attribute: initializing, listening, thinking, speaking.
	let agentState = $state('initializing');
	let errorMessage = $state('');
	// Some browsers (notably iPhone Safari) block audio until another tap.
	let audioBlocked = $state(false);
	let secondsLeft = $state(0);

	let room: Room | null = null;
	let countdown: ReturnType<typeof setInterval> | undefined;
	const audioElements: HTMLMediaElement[] = [];

	const STATE_LABELS: Record<string, string> = {
		initializing: 'Connecting to the rules agent…',
		idle: 'Connecting to the rules agent…',
		listening: 'Listening. Ask your rules question.',
		thinking: 'Checking the rulebook…',
		speaking: 'Answering…'
	};

	async function start() {
		status = 'connecting';
		errorMessage = '';
		try {
			const response = await fetch('/api/voice/token', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ sport, league })
			});
			const session = await response.json();
			if (!response.ok) {
				status = 'idle';
				errorMessage = refusalMessage(response.status, session.reason);
				return;
			}

			// Loaded only now, so visitors who never use voice don't download it.
			const { Room, RoomEvent, Track } = await import('livekit-client');
			const newRoom = new Room();
			room = newRoom;

			// Play the agent's voice: each audio track it publishes gets an <audio> element.
			newRoom.on(RoomEvent.TrackSubscribed, (track) => {
				if (track.kind !== Track.Kind.Audio) return;
				const element = track.attach();
				audioElements.push(element);
				document.body.appendChild(element);
			});
			newRoom.on(RoomEvent.ParticipantAttributesChanged, (changed, participant) => {
				if (participant.isAgent && changed['lk.agent.state']) agentState = changed['lk.agent.state'];
			});
			newRoom.on(RoomEvent.AudioPlaybackStatusChanged, () => {
				audioBlocked = !newRoom.canPlaybackAudio;
			});
			newRoom.on(RoomEvent.Disconnected, cleanUp);

			await newRoom.connect(session.serverUrl, session.token);
			await newRoom.localParticipant.setMicrophoneEnabled(true);

			audioBlocked = !newRoom.canPlaybackAudio;
			agentState = 'initializing';
			status = 'live';
			secondsLeft = session.maxSeconds;
			countdown = setInterval(() => {
				secondsLeft -= 1;
				if (secondsLeft <= 0) stop();
			}, 1000);
		} catch (err) {
			console.error('Voice failed to start:', err);
			await stop();
			errorMessage =
				err instanceof Error && err.name === 'NotAllowedError'
					? 'Allow microphone access in your browser to ask by voice.'
					: "Couldn't start voice. Please try again, or type your question.";
		}
	}

	async function stop() {
		const current = room;
		room = null;
		cleanUp();
		await current?.disconnect();
	}

	/** Removes the agent's audio and resets the button. Safe to call more than once. */
	function cleanUp() {
		clearInterval(countdown);
		for (const element of audioElements.splice(0)) element.remove();
		audioBlocked = false;
		status = 'idle';
	}

	function refusalMessage(httpStatus: number, reason?: string): string {
		if (reason === 'visitor_limit') return "That's your voice conversations for today. You can still type questions.";
		if (reason === 'global_limit') return "Voice is at capacity for today. You can still type questions.";
		if (httpStatus === 400) return 'Voice is not available for this league yet.';
		return 'Voice is unavailable right now. You can still type questions.';
	}

	function formatTime(seconds: number): string {
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
	}

	// Leaving the page hangs up, so the microphone never stays on in the background.
	onDestroy(() => {
		stop();
	});
</script>

<div class="mt-3" aria-live="polite">
	{#if status === 'live'}
		<div class="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3" role="status">
			<span class="relative flex size-3 shrink-0" aria-hidden="true">
				<span class="absolute inline-flex size-full animate-ping rounded-full bg-sport opacity-60"></span>
				<span class="relative inline-flex size-3 rounded-full bg-sport"></span>
			</span>
			<span class="min-w-0 flex-1 text-sm font-medium">
				{STATE_LABELS[agentState] ?? STATE_LABELS.initializing}
			</span>
			<span class="text-xs text-muted-foreground tabular-nums" title="Time left">{formatTime(secondsLeft)}</span>
			{#if audioBlocked}
				<Button size="sm" variant="outline" class="rounded-full" onclick={() => room?.startAudio()}>
					<Volume2Icon class="size-4" /> Tap to hear
				</Button>
			{/if}
			<Button size="sm" variant="outline" class="rounded-full" onclick={stop}>
				<PhoneOffIcon class="size-4" /> End
			</Button>
		</div>
	{:else}
		<Button
			variant="outline"
			disabled={status === 'connecting'}
			onclick={start}
			class="motion-choice h-auto rounded-full px-4 py-2 font-semibold hover:border-sport hover:bg-sport-soft"
		>
			<MicIcon class="size-4 text-sport" />
			{status === 'connecting' ? 'Connecting…' : 'Ask by voice'}
		</Button>
		{#if errorMessage}
			<p class="mt-2 pl-1 text-sm text-muted-foreground" role="alert">{errorMessage}</p>
		{/if}
	{/if}
</div>
