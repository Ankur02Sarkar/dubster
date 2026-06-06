"use client";

import { useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { useTtsEngine } from "@/hooks/useTtsEngine";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { VideoPlayer } from "@/components/VideoPlayer";
import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "@/app/watch/[videoId]/page";

export interface TtsEngineHandle {
	/** Seek the YouTube player to the given time and reschedule audio */
	seekTo: (seconds: number) => void;
}

interface TtsEngineProps {
	videoId: string;
	segments: TranscriptSegment[];
	/** Called on every 100ms time poll — use to sync TranscriptPanel */
	onTimeUpdate?: (currentTimeSeconds: number) => void;
	className?: string;
}

/**
 * Orchestrates the full dubbing pipeline:
 * - Renders the muted YouTube IFrame (VideoPlayer)
 * - Shows LoadingOverlay while the Kokoro model downloads / audio generates
 * - Wires VideoPlayer play/pause/seek events to the AudioScheduler
 *
 * Exposes a `TtsEngineHandle` ref so the parent can imperatively seek.
 */
export const TtsEngine = forwardRef<TtsEngineHandle, TtsEngineProps>(
	function TtsEngine({ videoId, segments, onTimeUpdate, className }, ref) {
	const {
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
	} = useTtsEngine();

		// Tear down the AudioContext when the component unmounts (route change)
		useEffect(() => {
			return () => {
				void destroy();
			};
		}, [destroy]);

		// Expose seekTo imperatively so the parent (WatchClient) can call it
		// from TranscriptPanel click events.
		useImperativeHandle(
			ref,
			() => ({
				seekTo(seconds: number) {
					seekPlayerTo(seconds);
					reschedule(seconds, segments);
				},
			}),
			[seekPlayerTo, reschedule, segments],
		);

		// -------------------------------------------------------------------------
		// VideoPlayer event handlers
		// -------------------------------------------------------------------------

		const handlePlay = useCallback(async () => {
			if (status === "idle") {
				// First play — kick off model load + audio generation.
				// Must be inside a user-gesture (play button click) for AudioContext.
				await start(segments);
			} else if (status === "ready" || status === "generating") {
				await resume();
			}
		}, [status, start, segments, resume]);

		const handlePause = useCallback(async () => {
			await suspend();
		}, [suspend]);

		const handleSeek = useCallback(
			(newTimeSeconds: number) => {
				if (status === "ready" || status === "generating") {
					reschedule(newTimeSeconds, segments);
				}
			},
			[status, reschedule, segments],
		);

		const handleEnded = useCallback(async () => {
			await suspend();
		}, [suspend]);

		const handleRetry = useCallback(() => {
			void start(segments);
		}, [start, segments]);

		// -------------------------------------------------------------------------
		// Render
		// -------------------------------------------------------------------------

		return (
			<div className={cn("relative w-full", className)}>
				<VideoPlayer
					videoId={videoId}
					onTimeUpdate={onTimeUpdate}
					onPlayerReady={registerPlayer}
					onPlay={() => void handlePlay()}
					onPause={() => void handlePause()}
					onSeek={handleSeek}
					onEnded={() => void handleEnded()}
				/>

				{/* Overlay rendered on top of the video while loading/generating */}
				<LoadingOverlay
					status={status}
					loadProgress={loadProgress}
					generatedCount={generatedCount}
					totalCount={totalCount}
					error={error}
					onRetry={handleRetry}
					className="rounded-xl"
				/>
			</div>
		);
	},
);
