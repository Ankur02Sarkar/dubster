"use client";

import { useEffect, useCallback } from "react";
import { useTtsEngine } from "@/hooks/useTtsEngine";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { VideoPlayer } from "@/components/VideoPlayer";
import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "@/app/watch/[videoId]/page";

interface TtsEngineProps {
	videoId: string;
	segments: TranscriptSegment[];
	className?: string;
}

/**
 * Orchestrates the full dubbing pipeline:
 * - Renders the muted YouTube IFrame (VideoPlayer)
 * - Shows LoadingOverlay while the Kokoro model downloads / audio generates
 * - Wires VideoPlayer play/pause/seek events to the AudioScheduler
 *
 * This is a Client Component — it owns all browser-side state.
 */
export function TtsEngine({ videoId, segments, className }: TtsEngineProps) {
	const {
		status,
		loadProgress,
		generatedCount,
		totalCount,
		error,
		start,
		reschedule,
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

	// -------------------------------------------------------------------------
	// VideoPlayer event handlers
	// -------------------------------------------------------------------------

	const handlePlay = useCallback(async () => {
		if (status === "idle") {
			// First play — kick off model load + audio generation.
			// This is inside a user gesture (the play button click), which is
			// required for AudioContext creation in browsers.
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
}
