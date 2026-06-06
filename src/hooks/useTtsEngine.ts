"use client";

import { useState, useCallback, useRef } from "react";
import { initTTS, generateSegmentAudio, isTTSReady, DEFAULT_VOICE } from "@/lib/tts";
import { getAudioScheduler, destroyAudioScheduler } from "@/lib/audio-scheduler";
import type { TranscriptSegment } from "@/app/watch/[videoId]/page";
import type { KokoroTTS } from "kokoro-js";

export type TtsStatus =
	| "idle"         // not started
	| "loading"      // downloading / initialising the ONNX model
	| "generating"   // model ready, generating audio for segments
	| "ready"        // all segments generated, scheduler loaded
	| "error";       // something went wrong

export interface UseTtsEngineReturn {
	status: TtsStatus;
	/** 0–100 model download progress (only meaningful during "loading") */
	loadProgress: number;
	/** How many segments have had audio generated */
	generatedCount: number;
	/** Total segments */
	totalCount: number;
	/** Error message if status === "error" */
	error: string | null;
	/**
	 * Start loading the TTS model and pre-generating audio for all segments.
	 * Must be called from a user-gesture handler (play button click).
	 * Idempotent — safe to call multiple times.
	 */
	start: (segments: TranscriptSegment[]) => Promise<void>;
	/**
	 * Re-schedule audio from a new video position (call on seek events).
	 */
	reschedule: (videoCurrentTimeSeconds: number, segments: TranscriptSegment[]) => void;
	/**
	 * Seek the YouTube player to the given time.
	 * The caller must also call reschedule() afterward if audio is active.
	 */
	seekPlayerTo: (seconds: number) => void;
	/** Register the YT.Player instance so seekPlayerTo() can call it */
	registerPlayer: (player: YT.Player | null) => void;
	/** Suspend audio (call on video pause/buffer) */
	suspend: () => Promise<void>;
	/** Resume audio (call on video play) */
	resume: () => Promise<void>;
	/** Tear down the AudioContext (call on page unmount) */
	destroy: () => Promise<void>;
}

/**
 * Manages the full TTS + audio scheduling lifecycle:
 * 1. Download/init the Kokoro ONNX model
 * 2. Pre-generate AudioBuffers for every transcript segment
 * 3. Schedule them via AudioScheduler keyed to the video clock
 */
export function useTtsEngine(): UseTtsEngineReturn {
	const [status, setStatus] = useState<TtsStatus>(() =>
		isTTSReady() ? "idle" : "idle",
	);
	const [loadProgress, setLoadProgress] = useState(0);
	const [generatedCount, setGeneratedCount] = useState(0);
	const [totalCount, setTotalCount] = useState(0);
	const [error, setError] = useState<string | null>(null);

	// Persisted across renders without triggering re-renders
	const ttsRef = useRef<KokoroTTS | null>(null);
	const buffersRef = useRef<(AudioBuffer | null)[]>([]);
	const startedRef = useRef(false);
	// Holds a reference to the live YT.Player for imperative seeking
	const ytPlayerRef = useRef<YT.Player | null>(null);

	const registerPlayer = useCallback((player: YT.Player | null) => {
		ytPlayerRef.current = player;
	}, []);

	const seekPlayerTo = useCallback((seconds: number) => {
		ytPlayerRef.current?.seekTo(seconds, true);
	}, []);

	const start = useCallback(async (segments: TranscriptSegment[]) => {
		if (startedRef.current) return;
		startedRef.current = true;

		setStatus("loading");
		setTotalCount(segments.length);
		buffersRef.current = new Array(segments.length).fill(null);

		try {
			// 1. Load (or reuse) the Kokoro model
			const tts = await initTTS((loaded, total, percent) => {
				void loaded;
				void total;
				setLoadProgress(percent);
			});
			ttsRef.current = tts;

			// 2. Get (or create) the AudioContext via the scheduler singleton.
			//    Must happen inside a user-gesture context — the caller (play button)
			//    ensures we're inside a gesture when start() is invoked.
			const scheduler = getAudioScheduler();

			setStatus("generating");

			// 3. Generate audio for each segment sequentially.
			//    Sequential keeps memory pressure low vs. firing all in parallel.
			//    The scheduler skips null buffers, so partial generation still works.
			for (let i = 0; i < segments.length; i++) {
				const seg = segments[i];
				if (!seg.text.trim()) {
					setGeneratedCount((n) => n + 1);
					continue;
				}

				try {
					const buf = await generateSegmentAudio(
						tts,
						seg.text,
						scheduler.audioContext,
						DEFAULT_VOICE,
					);
					buffersRef.current[i] = buf;
				} catch (segErr) {
					// Log but don't abort — a silent gap is better than crashing
					console.warn(`[useTtsEngine] Segment ${i} failed:`, segErr);
				}

				setGeneratedCount((n) => n + 1);
			}

			setStatus("ready");
		} catch (err) {
			console.error("[useTtsEngine] Fatal error:", err);
			setError(err instanceof Error ? err.message : String(err));
			setStatus("error");
			startedRef.current = false; // allow retry
		}
	}, []);

	const reschedule = useCallback(
		(videoCurrentTimeSeconds: number, segments: TranscriptSegment[]) => {
			if (buffersRef.current.length === 0) return;
			const scheduler = getAudioScheduler();
			scheduler.cancelAll();
			scheduler.scheduleFrom(segments, buffersRef.current, videoCurrentTimeSeconds);
		},
		[],
	);

	const suspend = useCallback(async () => {
		await getAudioScheduler().suspend();
	}, []);

	const resume = useCallback(async () => {
		await getAudioScheduler().resume();
	}, []);

	const destroy = useCallback(async () => {
		await destroyAudioScheduler();
		startedRef.current = false;
		buffersRef.current = [];
		ytPlayerRef.current = null;
	}, []);

	return {
		status,
		loadProgress,
		generatedCount,
		totalCount,
		error,
		start,
		reschedule,
		seekPlayerTo,
		registerPlayer,
		suspend,
		resume,
		destroy,
	};
}
