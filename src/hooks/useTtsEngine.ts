"use client";

import { useState, useCallback, useRef } from "react";
import { initTTS, generateSegmentAudio, isTTSReady, DEFAULT_VOICE } from "@/lib/tts";
import { getAudioScheduler, destroyAudioScheduler } from "@/lib/audio-scheduler";
import type { TranscriptSegment } from "@/app/watch/[videoId]/page";
import type { KokoroTTS } from "kokoro-js";

// How many segments to generate before enabling the play button.
const PRIME_COUNT = 5;

export type TtsStatus =
	| "idle"         // page just loaded, not started yet
	| "loading"      // downloading / initialising the ~92MB ONNX model
	| "priming"      // model ready, generating first PRIME_COUNT segments
	| "playable"     // first PRIME_COUNT segments ready — play enabled, rest generating in bg
	| "generating"   // alias used after play: background generation still in progress
	| "ready"        // all segments generated
	| "error";

export interface UseTtsEngineReturn {
	status: TtsStatus;
	/** True when the user may press play (first PRIME_COUNT segments are ready) */
	isPlayable: boolean;
	/** 0–100 model download/init progress */
	loadProgress: number;
	/** How many of the first PRIME_COUNT segments are ready (during "priming") */
	primingCount: number;
	/** How many total segments have been generated */
	generatedCount: number;
	/** Total number of segments */
	totalCount: number;
	/** Error message when status === "error" */
	error: string | null;
	/**
	 * Kick off model download + background generation immediately on mount.
	 * Does NOT require a user gesture — the AudioContext is created lazily on
	 * the first play click.
	 */
	autoStart: (segments: TranscriptSegment[]) => void;
	/**
	 * Create the AudioContext (requires user gesture), resume it, and schedule
	 * already-generated segments from the current video position.
	 * Call this when the user clicks play.
	 */
	play: (videoCurrentTimeSeconds: number, segments: TranscriptSegment[]) => Promise<void>;
	/** Update the internally-tracked video time (call from onTimeUpdate) */
	updateCurrentTime: (seconds: number) => void;
	/** Suspend audio (call on video pause/buffer) */
	suspend: () => Promise<void>;
	/** Resume audio without rescheduling (call on video resume after pause) */
	resume: () => Promise<void>;
	/**
	 * Seek: cancel all scheduled audio, reschedule from new position.
	 * Also reprioritises background generation to start near seekTimeSeconds.
	 */
	seekTo: (seekTimeSeconds: number, segments: TranscriptSegment[]) => void;
	/** Register the live YT.Player instance for imperative seeking */
	registerPlayer: (player: YT.Player | null) => void;
	/** Seek the YouTube player imperatively */
	seekPlayerTo: (seconds: number) => void;
	/** Tear down the AudioContext (call on page unmount) */
	destroy: () => Promise<void>;
}

export function useTtsEngine(): UseTtsEngineReturn {
	const [status, setStatus] = useState<TtsStatus>("idle");
	const [loadProgress, setLoadProgress] = useState(0);
	const [primingCount, setPrimingCount] = useState(0);
	const [generatedCount, setGeneratedCount] = useState(0);
	const [totalCount, setTotalCount] = useState(0);
	const [error, setError] = useState<string | null>(null);

	const ttsRef = useRef<KokoroTTS | null>(null);
	const buffersRef = useRef<(AudioBuffer | null)[]>([]);
	const startedRef = useRef(false);
	const ytPlayerRef = useRef<YT.Player | null>(null);

	// Written by seekTo(); read+cleared by the background generation loop
	// to reprioritise generation near the seek target.
	const seekTargetRef = useRef<number | null>(null);

	// Current video time — updated by the caller via the time poll.
	// Used by scheduleOne() to decide whether to schedule newly-ready segments.
	const currentVideoTimeRef = useRef(0);

	// Whether the AudioContext has been started by a user gesture yet.
	const audioStartedRef = useRef(false);

	// ---------------------------------------------------------------------------
	// Player registration
	// ---------------------------------------------------------------------------

	const registerPlayer = useCallback((player: YT.Player | null) => {
		ytPlayerRef.current = player;
	}, []);

	const seekPlayerTo = useCallback((seconds: number) => {
		ytPlayerRef.current?.seekTo(seconds, true);
	}, []);

	// ---------------------------------------------------------------------------
	// autoStart — fires on mount, no gesture needed
	// ---------------------------------------------------------------------------

	const autoStart = useCallback((segments: TranscriptSegment[]) => {
		if (startedRef.current) return;
		startedRef.current = true;

		setTotalCount(segments.length);
		buffersRef.current = new Array<AudioBuffer | null>(segments.length).fill(null);

		// Run the full pipeline asynchronously — don't block the caller.
		void runPipeline(segments);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ---------------------------------------------------------------------------
	// Core async pipeline (runs entirely in the background)
	// ---------------------------------------------------------------------------

	async function runPipeline(segments: TranscriptSegment[]) {
		try {
			// ---- Phase 1: Load model ----
			setStatus("loading");
			const tts = await initTTS((_, __, percent) => setLoadProgress(percent));
			ttsRef.current = tts;

			// ---- Phase 2: Prime first PRIME_COUNT segments ----
			setStatus("priming");
			const primeEnd = Math.min(PRIME_COUNT, segments.length);

			for (let i = 0; i < primeEnd; i++) {
				await generateOne(tts, segments, i);
				setPrimingCount((n) => n + 1);
			}

			// ---- Phase 3: Signal play is enabled ----
			setStatus("playable");

			// ---- Phase 4: Generate the rest in background with seek reprioritisation ----
			await generateBackground(tts, segments, primeEnd);

		} catch (err) {
			console.error("[useTtsEngine] Fatal error:", err);
			setError(err instanceof Error ? err.message : String(err));
			setStatus("error");
			startedRef.current = false;
		}
	}

	// ---------------------------------------------------------------------------
	// Helper: generate a single segment and store its buffer
	// ---------------------------------------------------------------------------

	async function generateOne(
		tts: KokoroTTS,
		segments: TranscriptSegment[],
		index: number,
	): Promise<void> {
		const seg = segments[index];
		if (!seg || !seg.text.trim()) {
			setGeneratedCount((n) => n + 1);
			return;
		}
		// AudioContext may not exist yet (created on first play gesture).
		// We create it here if needed so generation can begin.
		const scheduler = getAudioScheduler();
		try {
			const buf = await generateSegmentAudio(tts, seg.text, scheduler.audioContext, DEFAULT_VOICE);
			buffersRef.current[index] = buf;
			// Progressive scheduling: if audio is already playing, schedule this
			// new segment immediately without waiting for all segments to be ready.
			scheduler.scheduleOne(index, seg, buf, currentVideoTimeRef.current);
		} catch (segErr) {
			console.warn(`[useTtsEngine] Segment ${index} failed:`, segErr);
		}
		setGeneratedCount((n) => n + 1);
	}

	// ---------------------------------------------------------------------------
	// Background generation loop with seek-jump reprioritisation
	// ---------------------------------------------------------------------------

	async function generateBackground(
		tts: KokoroTTS,
		segments: TranscriptSegment[],
		startIndex: number,
	): Promise<void> {
		let i = startIndex;
		const total = segments.length;
		// Track which indices have been generated to avoid double-work after seek jumps.
		const generated = new Set<number>();
		// Seed with already-done primed indices
		for (let k = 0; k < startIndex; k++) generated.add(k);

		while (generated.size < total) {
			// Check if a seek has been requested — if so, jump to the nearest
			// segment at the seek position so dubbed audio is available there first.
			const seekTarget = seekTargetRef.current;
			if (seekTarget !== null) {
				seekTargetRef.current = null;
				const jumpIdx = findSegmentIndex(segments, seekTarget);
				// Find the first not-yet-generated index at or after the jump point
				let candidate = jumpIdx;
				while (candidate < total && generated.has(candidate)) candidate++;
				if (candidate < total) {
					i = candidate;
				}
			}

			// Skip already-generated indices
			if (generated.has(i)) {
				i = (i + 1) % total;
				// Safety: if we've wrapped all the way around, break
				if (generated.size >= total) break;
				continue;
			}

			await generateOne(tts, segments, i);
			generated.add(i);

			// Advance index, wrapping around so seek-jumped gaps get filled
			i = nextUngenerated(i + 1, total, generated);
			if (i === -1) break;
		}

		setStatus("ready");
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	/** Find the segment index whose offset is closest to `timeSeconds * 1000` */
	function findSegmentIndex(segments: TranscriptSegment[], timeSeconds: number): number {
		const targetMs = timeSeconds * 1000;
		let best = 0;
		let bestDiff = Infinity;
		for (let i = 0; i < segments.length; i++) {
			const diff = Math.abs(segments[i].offset - targetMs);
			if (diff < bestDiff) { bestDiff = diff; best = i; }
		}
		return best;
	}

	/** Returns next index in [start..total) not in `generated`, or -1 if all done */
	function nextUngenerated(start: number, total: number, generated: Set<number>): number {
		// Linear scan wrapping once
		for (let offset = 0; offset < total; offset++) {
			const idx = (start + offset) % total;
			if (!generated.has(idx)) return idx;
		}
		return -1;
	}

	// ---------------------------------------------------------------------------
	// Public controls (require user gesture context)
	// ---------------------------------------------------------------------------

	const updateCurrentTime = useCallback((seconds: number) => {
		currentVideoTimeRef.current = seconds;
	}, []);

	const play = useCallback(async (
		videoCurrentTimeSeconds: number,
		segments: TranscriptSegment[],
	) => {
		// Use the latest known time (updated by onTimeUpdate poll) if the caller passes 0
		const t = videoCurrentTimeSeconds > 0 ? videoCurrentTimeSeconds : currentVideoTimeRef.current;
		const scheduler = getAudioScheduler();
		// Resume the AudioContext — this MUST be inside a user gesture handler.
		await scheduler.resume();
		audioStartedRef.current = true;
		// Schedule all buffers we have so far from the current position.
		scheduler.scheduleFrom(segments, buffersRef.current, t);
	}, []);

	const suspend = useCallback(async () => {
		if (!audioStartedRef.current) return;
		await getAudioScheduler().suspend();
	}, []);

	const resume = useCallback(async () => {
		if (!audioStartedRef.current) return;
		await getAudioScheduler().resume();
	}, []);

	const seekTo = useCallback((seekTimeSeconds: number, segments: TranscriptSegment[]) => {
		currentVideoTimeRef.current = seekTimeSeconds;
		// Signal the background generation loop to reprioritise near seekTimeSeconds.
		seekTargetRef.current = seekTimeSeconds;
		// Cancel all currently scheduled audio nodes and reschedule from the new position.
		if (audioStartedRef.current) {
			const scheduler = getAudioScheduler();
			scheduler.cancelAll();
			scheduler.scheduleFrom(segments, buffersRef.current, seekTimeSeconds);
		}
	}, []);

	const destroy = useCallback(async () => {
		await destroyAudioScheduler();
		startedRef.current = false;
		audioStartedRef.current = false;
		buffersRef.current = [];
		ytPlayerRef.current = null;
		seekTargetRef.current = null;
	}, []);

	// ---------------------------------------------------------------------------
	// Derived state
	// ---------------------------------------------------------------------------

	const isPlayable =
		status === "playable" ||
		status === "generating" ||
		status === "ready";

	return {
		status,
		isPlayable,
		loadProgress,
		primingCount,
		generatedCount,
		totalCount,
		error,
		autoStart,
		play,
		suspend,
		resume,
		seekTo,
		updateCurrentTime,
		registerPlayer,
		seekPlayerTo,
		destroy,
	};
}
