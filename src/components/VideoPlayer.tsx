"use client";

import { useEffect, useRef } from "react";
import { useYouTubePlayer, DRIFT_THRESHOLD_S } from "@/hooks/useYouTubePlayer";
import { cn } from "@/lib/utils";

// The YT.PlayerState values we care about
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_ENDED = 0;

const PLAYER_ELEMENT_ID = "yt-player";

export interface VideoPlayerProps {
	videoId: string;
	/**
	 * Called whenever the player's current time is updated (every 100ms while playing).
	 * Use this to drive audio scheduler drift correction.
	 */
	onTimeUpdate?: (currentTimeSeconds: number) => void;
	/** Called when playback starts or resumes */
	onPlay?: () => void;
	/** Called when playback pauses or buffers */
	onPause?: () => void;
	/** Called when the video ends */
	onEnded?: () => void;
	/**
	 * Called when a seek is detected (current time jumps by more than DRIFT_THRESHOLD_S).
	 * The audio scheduler should cancel and reschedule from `newTimeSeconds`.
	 */
	onSeek?: (newTimeSeconds: number) => void;
	/**
	 * Called once the YT.Player instance is ready.
	 * Use this to register the player for imperative seeking from outside.
	 */
	onPlayerReady?: (player: YT.Player) => void;
	className?: string;
}

/**
 * Embeds a muted YouTube video via the IFrame Player API and exposes playback
 * events to the parent for audio sync coordination.
 *
 * This component is responsible for:
 * - Loading the IFrame API once
 * - Mounting/destroying the YT.Player
 * - Keeping the player muted at all times
 * - Detecting seeks via time-jump detection and forwarding to onSeek
 * - Forwarding play/pause/buffer state changes
 */
export function VideoPlayer({
	videoId,
	onTimeUpdate,
	onPlay,
	onPause,
	onEnded,
	onSeek,
	onPlayerReady,
	className,
}: VideoPlayerProps) {
	const { isReady, playerState, currentTime, playerRef } = useYouTubePlayer(
		videoId,
		PLAYER_ELEMENT_ID,
	);

	// Notify parent once the player instance is ready for imperative control
	useEffect(() => {
		if (isReady && playerRef.current) {
			onPlayerReady?.(playerRef.current);
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isReady]);

	// Track the previous current time to detect seeks
	const prevTimeRef = useRef<number>(0);

	// Forward time updates and detect seeks
	useEffect(() => {
		if (!isReady) return;

		const delta = Math.abs(currentTime - prevTimeRef.current);

		// A jump larger than DRIFT_THRESHOLD_S that wasn't caused by normal playback
		// (normal playback advances ~0.1s per 100ms poll) is treated as a seek.
		if (delta > DRIFT_THRESHOLD_S && prevTimeRef.current !== 0) {
			onSeek?.(currentTime);
		}

		prevTimeRef.current = currentTime;
		onTimeUpdate?.(currentTime);
	}, [currentTime, isReady, onSeek, onTimeUpdate]);

	// Forward player state changes (play / pause / buffer / ended)
	useEffect(() => {
		if (playerState === null) return;

		if (playerState === YT_PLAYING) {
			// Re-mute on every play event — belt-and-suspenders guard
			playerRef.current?.mute();
			onPlay?.();
		} else if (playerState === YT_PAUSED || playerState === YT_BUFFERING) {
			onPause?.();
		} else if (playerState === YT_ENDED) {
			onEnded?.();
		}
	}, [playerState, onPlay, onPause, onEnded, playerRef]);

	return (
		<div className={cn("relative w-full aspect-video rounded-xl overflow-hidden bg-black", className)}>
			{/* Loading skeleton shown until the IFrame API is ready */}
			{!isReady && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/30 animate-pulse">
					<div className="size-12 rounded-full bg-muted" />
					<div className="h-3 w-24 rounded bg-muted" />
				</div>
			)}

			{/*
			 * The IFrame API replaces this <div> with the actual <iframe>.
			 * It must exist in the DOM before createYTPlayer() is called.
			 * aspect-video on the parent ensures the slot is always 16:9.
			 */}
			<div
				id={PLAYER_ELEMENT_ID}
				className="w-full h-full"
				aria-label="YouTube video player (muted)"
			/>
		</div>
	);
}
