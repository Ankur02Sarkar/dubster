"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { loadYouTubeIFrameAPI, createYTPlayer } from "@/lib/youtube";

// Poll the player's current time at this interval (ms).
// 100ms gives ~10fps time resolution — sufficient for segment-level sync.
export const POLL_INTERVAL_MS = 100;

// If the audio clock drifts more than this from the video clock (seconds),
// the audio scheduler should cancel and reschedule from the new position.
export const DRIFT_THRESHOLD_S = 0.3;

export interface UseYouTubePlayerReturn {
	/** True once the IFrame API has loaded and the player is ready */
	isReady: boolean;
	/** Current YT.PlayerState value, or null before the player is initialised */
	playerState: number | null;
	/** Current playback position in seconds, updated every POLL_INTERVAL_MS */
	currentTime: number;
	/** Direct ref to the YT.Player instance for imperative control */
	playerRef: React.RefObject<YT.Player | null>;
	/** Seek the video to the given time in seconds */
	seek: (seconds: number) => void;
	/** Mute the YouTube player (Kokoro audio replaces it) */
	mute: () => void;
}

/**
 * Manages the lifecycle of a YouTube IFrame Player.
 *
 * @param videoId  The 11-character YouTube video ID
 * @param elementId  The DOM element ID where the player will be mounted
 */
export function useYouTubePlayer(
	videoId: string,
	elementId: string,
): UseYouTubePlayerReturn {
	const playerRef = useRef<YT.Player | null>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const [isReady, setIsReady] = useState(false);
	const [playerState, setPlayerState] = useState<number | null>(null);
	const [currentTime, setCurrentTime] = useState(0);

	useEffect(() => {
		let mounted = true;

		loadYouTubeIFrameAPI().then(() => {
			if (!mounted) return;

			playerRef.current = createYTPlayer({
				elementId,
				videoId,
				events: {
					onReady: () => {
						if (!mounted) return;
						// Always mute — Kokoro audio is the audio track
						playerRef.current?.mute();
						setIsReady(true);
					},
					onStateChange: (event: YT.OnStateChangeEvent) => {
						if (!mounted) return;
						setPlayerState(event.data);
					},
					onError: (event: YT.OnErrorEvent) => {
						console.error("[useYouTubePlayer] Player error:", event.data);
					},
				},
			});
		});

		return () => {
			mounted = false;
			if (pollRef.current) clearInterval(pollRef.current);
			// Destroy the player to release the IFrame and event listeners
			try {
				playerRef.current?.destroy();
			} catch {
				// destroy() can throw if the IFrame was already removed from DOM
			}
			playerRef.current = null;
		};
	}, [videoId, elementId]);

	// Start polling getCurrentTime() once the player is ready
	useEffect(() => {
		if (!isReady) return;

		pollRef.current = setInterval(() => {
			const t = playerRef.current?.getCurrentTime() ?? 0;
			setCurrentTime(t);
		}, POLL_INTERVAL_MS);

		return () => {
			if (pollRef.current) clearInterval(pollRef.current);
		};
	}, [isReady]);

	const seek = useCallback((seconds: number) => {
		playerRef.current?.seekTo(seconds, true);
	}, []);

	const mute = useCallback(() => {
		playerRef.current?.mute();
	}, []);

	return { isReady, playerState, currentTime, playerRef, seek, mute };
}
