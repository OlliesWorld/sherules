<script lang="ts">
	import { onDestroy } from 'svelte';
	import MicIcon from '@lucide/svelte/icons/mic';
	import PhoneOffIcon from '@lucide/svelte/icons/phone-off';
	import Volume2Icon from '@lucide/svelte/icons/volume-2';
	import VoiceRing from '#lib/components/VoiceRing.svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import { VOICE_IDLE_SECONDS } from '#lib/voice.ts';
	import type { Room } from 'livekit-client';

	// "Ask by voice": talk to the SheRules voice agent (LiveKit) from the league page.
	// 1. Ask our server for a token (POST /api/voice/token), which also applies the daily limits
	// 2. Join the private LiveKit room with the microphone on; the agent joins and answers
	// 3. When time runs out, mute the mic and let the agent finish its answer, then hang up.
	//    Also hang up after VOICE_IDLE_SECONDS with nobody talking, when the visitor taps End,
	//    or when leaving the page.
	let { sport, league }: { sport: string; league: string } = $props();

	/** The ring turns amber and pulses for the last stretch of the call. */
	const WARNING_SECONDS = 30;
	/** Longest the agent may keep talking after time runs out. */
	const WRAP_UP_LIMIT_SECONDS = 20;

	type Status = 'idle' | 'connecting' | 'live';
	let status = $state<Status>('idle');
	// The agent's state, from its 'lk.agent.state' attribute: initializing, listening, thinking, speaking.
	let agentState = $state('initializing');
	// Shown under the button: why a call couldn't start, or how it ended.
	let message = $state('');
	// Some browsers (notably iPhone Safari) block audio until another tap.
	let audioBlocked = $state(false);
	let secondsLeft = $state(0);
	let maxSeconds = $state(1);
	// Time's up: the mic is off and the agent is finishing its answer.
	let wrappingUp = $state(false);

	let room: Room | null = null;
	let ticker: ReturnType<typeof setInterval> | undefined;
	// Seconds in a row with nobody talking and the agent not thinking or answering.
	let silentSeconds = 0;
	let wrapUpSeconds = 0;
	// Voice calls left today after this one, from the server (undefined in local development).
	let sessionsLeft: number | undefined;
	const audioElements: HTMLMediaElement[] = [];

	const STATE_LABELS: Record<string, string> = {
		initializing: 'Connecting to the rules agent…',
		idle: 'Connecting to the rules agent…',
		listening: 'Listening. Ask your rules question.',
		thinking: 'Checking the rulebook…',
		speaking: 'Answering…'
	};

	let agentBusy = $derived(agentState === 'thinking' || agentState === 'speaking');
	let statusLabel = $derived(
		wrappingUp ? 'Time’s up. Finishing this answer…' : (STATE_LABELS[agentState] ?? STATE_LABELS.initializing)
	);

	async function start() {
		status = 'connecting';
		message = '';
		try {
			const response = await fetch('/api/voice/token', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ sport, league })
			});
			const session = await response.json();
			if (!response.ok) {
				status = 'idle';
				message = refusalMessage(response.status, session.reason);
				return;
			}

			// Loaded only now, so visitors who never use voice don't download it.
			const { Room, RoomEvent, Track, setLogLevel } = await import('livekit-client');
			// LiveKit logs every connection step to the browser console; keep visitors' consoles quiet.
			setLogLevel('silent');
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
			sessionsLeft = session.sessionsLeft;
			maxSeconds = session.maxSeconds;
			secondsLeft = session.maxSeconds;
			silentSeconds = 0;
			wrappingUp = false;
			status = 'live';
			ticker = setInterval(() => tick(newRoom), 1000);
		} catch (err) {
			await stop();
			message =
				err instanceof Error && err.name === 'NotAllowedError'
					? 'Allow microphone access in your browser to ask by voice.'
					: "Couldn't start voice. Please try again, or type your question.";
		}
	}

	/** Runs once a second during a call: counts down, and ends the call gently when it's time. */
	function tick(currentRoom: Room) {
		if (wrappingUp) {
			// Let the agent finish its answer, but not indefinitely.
			wrapUpSeconds += 1;
			if (!agentBusy || wrapUpSeconds >= WRAP_UP_LIMIT_SECONDS) endWith(`That's time! ${callsLeftText()}`);
			return;
		}

		secondsLeft = Math.max(0, secondsLeft - 1);
		const someoneTalking = currentRoom.activeSpeakers.length > 0;
		silentSeconds = someoneTalking || agentBusy ? 0 : silentSeconds + 1;

		if (secondsLeft === 0) {
			beginWrapUp(currentRoom);
		} else if (silentSeconds >= VOICE_IDLE_SECONDS) {
			endWith(`Call ended after ${VOICE_IDLE_SECONDS} seconds of quiet. ${callsLeftText()}`);
		}
	}

	/** Time's up: stop taking questions, and hang up once the agent finishes speaking. */
	function beginWrapUp(currentRoom: Room) {
		wrappingUp = true;
		wrapUpSeconds = 0;
		currentRoom.localParticipant.setMicrophoneEnabled(false).catch(() => {});
		if (!agentBusy) endWith(`That's time! ${callsLeftText()}`);
	}

	/** Hangs up and shows how the call ended, under the button. */
	async function endWith(closing: string) {
		await stop();
		message = closing.trim();
	}

	async function stop() {
		const current = room;
		room = null;
		cleanUp();
		await current?.disconnect();
	}

	/** Removes the agent's audio and resets the button. Safe to call more than once. */
	function cleanUp() {
		clearInterval(ticker);
		for (const element of audioElements.splice(0)) element.remove();
		audioBlocked = false;
		wrappingUp = false;
		status = 'idle';
	}

	function callsLeftText(): string {
		if (sessionsLeft === undefined) return '';
		if (sessionsLeft === 0) return 'That was your last voice call today. You can still type questions.';
		return `You have ${sessionsLeft} voice call${sessionsLeft === 1 ? '' : 's'} left today.`;
	}

	function refusalMessage(httpStatus: number, reason?: string): string {
		if (reason === 'visitor_limit') return "That's your voice calls for today. You can still type questions.";
		if (reason === 'global_limit') return 'Voice is at capacity for today. You can still type questions.';
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
		<div class="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-3 py-2.5" role="status">
			<VoiceRing
				remaining={secondsLeft / maxSeconds}
				warning={secondsLeft <= WARNING_SECONDS}
				micOff={wrappingUp}
				label="{formatTime(secondsLeft)} left in this call"
			/>
			<span class="min-w-0 flex-1 text-sm font-medium">{statusLabel}</span>
			<!-- An exact countdown for the last stretch, for anyone who'd rather read a number than the ring. -->
			{#if secondsLeft <= WARNING_SECONDS && !wrappingUp}
				<span class="text-sm font-semibold text-voice-warning-text tabular-nums" aria-hidden="true">
					{formatTime(secondsLeft)}
				</span>
			{/if}
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
		{#if message}
			<p class="mt-2 pl-1 text-sm text-muted-foreground">{message}</p>
		{/if}
	{/if}
</div>
