"use client";

import { useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { useTtsEngine } from "@/hooks/useTtsEngine";
import { VideoPlayer } from "@/components/VideoPlayer";
import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "@/app/watch/[videoId]/page";
import type { TtsStatus } from "@/hooks/useTtsEngine";

export interface TtsEngineHandle {
	/** Seek the YouTube player and reschedule audio from the new position */
	seekTo: (seconds: number) => void;
}

interface TtsEngineProps {
	videoId: string;
	segments: TranscriptSegment[];
	/** Called on every 100ms time poll — drives TranscriptPanel highlight */
	onTimeUpdate?: (currentTimeSeconds: number) => void;
	/** Called whenever TTS pipeline status changes */
	onStatusChange?: (status: TtsStatus) => void;
	className?: string;
}

/**
 * Orchestrates the full dubbing pipeline:
 * 1. On mount: auto-starts model download + background generation (no gesture needed)
 * 2. Keeps the YouTube player disabled until the first PRIME_COUNT segments are ready
 * 3. On play: resumes AudioContext (gesture) + schedules available audio
 * 4. On seek: reprioritises background generation + reschedules audio
 * 5. Continues generating remaining segments in background while video plays
 */
export const TtsEngine = forwardRef<TtsEngineHandle, TtsEngineProps>(
	function TtsEngine({ videoId, segments, onTimeUpdate, onStatusChange, className }, ref) {
		const {
			status,
			isPlayable,
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
			loadProgress,
			primingCount,
			generatedCount,
			totalCount,
		} = useTtsEngine();

		// Kick off model download + generation immediately — no gesture needed.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		useEffect(() => { autoStart(segments); }, []);

		// Tear down AudioContext on unmount
		useEffect(() => () => { void destroy(); }, [destroy]);

		// Bubble status up to WatchClient for the info bar
		useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);

		// Expose seekTo handle so WatchClient / TranscriptPanel can call it
		useImperativeHandle(ref, () => ({
			seekTo(seconds: number) {
				seekPlayerTo(seconds);
				seekTo(seconds, segments);
			},
		}), [seekPlayerTo, seekTo, segments]);

		// -----------------------------------------------------------------------
		// VideoPlayer event handlers
		// -----------------------------------------------------------------------

		const handleTimeUpdate = useCallback((t: number) => {
			updateCurrentTime(t);
			onTimeUpdate?.(t);
		}, [updateCurrentTime, onTimeUpdate]);

		const handlePlay = useCallback(async () => {
			if (!isPlayable) return;
			// Pass 0 — play() internally uses currentVideoTimeRef which was updated
			// by the last onTimeUpdate tick (or 0 if video hasn't played yet).
			await play(0, segments);
		}, [isPlayable, play, segments]);

		const handlePause = useCallback(async () => {
			await suspend();
		}, [suspend]);

		const handleSeek = useCallback((newTimeSeconds: number) => {
			seekTo(newTimeSeconds, segments);
		}, [seekTo, segments]);

		const handleEnded = useCallback(async () => {
			await suspend();
		}, [suspend]);

		// resume() is called implicitly via handlePlay when the user unpauses.
		// (YT fires onPlay on both initial play and resume-after-pause.)

		// -----------------------------------------------------------------------
		// Derive overlay state for the video disabled chip
		// -----------------------------------------------------------------------

		const overlayState: "loading" | "priming" | "error" | null =
			status === "error"   ? "error"   :
			status === "loading" ? "loading" :
			status === "priming" ? "priming" :
			null;

		return (
			<div className={cn("relative w-full", className)}>
				<VideoPlayer
					videoId={videoId}
					disabled={!isPlayable}
					overlayState={overlayState}
					loadProgress={loadProgress}
					primingCount={primingCount}
					primingTotal={Math.min(5, segments.length)}
					generatedCount={generatedCount}
					totalCount={totalCount}
					errorMessage={error}
					onTimeUpdate={handleTimeUpdate}
					onPlayerReady={registerPlayer}
					onPlay={() => void handlePlay()}
					onPause={() => void handlePause()}
				onSeek={handleSeek}
					onEnded={() => void handleEnded()}
				/>
			</div>
		);
	},
);
