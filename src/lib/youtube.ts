/**
 * YouTube IFrame Player API wrapper.
 *
 * All code here is browser-only. Never import this in RSC or route handlers.
 * The IFrame API is loaded lazily via a <script> tag and calls the global
 * window.onYouTubeIframeAPIReady when ready.
 */

// Extend the global Window type to include the IFrame API globals
declare global {
	interface Window {
		onYouTubeIframeAPIReady?: () => void;
		YT?: typeof YT;
	}
}

let apiLoadPromise: Promise<void> | null = null;

/**
 * Loads the YouTube IFrame Player API script exactly once, regardless of how
 * many times this function is called. Safe to call from multiple components.
 */
export function loadYouTubeIFrameAPI(): Promise<void> {
	// Already loaded
	if (typeof window !== "undefined" && window.YT?.Player) {
		return Promise.resolve();
	}

	// Already loading — return the in-flight promise
	if (apiLoadPromise) return apiLoadPromise;

	apiLoadPromise = new Promise((resolve) => {
		const prev = window.onYouTubeIframeAPIReady;

		// The IFrame API calls this global when it has fully bootstrapped
		window.onYouTubeIframeAPIReady = () => {
			prev?.();
			resolve();
		};

		const script = document.createElement("script");
		script.src = "https://www.youtube.com/iframe_api";
		script.async = true;
		document.head.appendChild(script);
	});

	return apiLoadPromise;
}

export interface CreatePlayerOptions {
	elementId: string;
	videoId: string;
	events: YT.Events;
}

/**
 * Creates a YT.Player instance inside the element with the given ID.
 * The element must exist in the DOM before this is called.
 * The video starts muted — Kokoro audio is the active audio track.
 */
export function createYTPlayer({ elementId, videoId, events }: CreatePlayerOptions): YT.Player {
	return new window.YT!.Player(elementId, {
		videoId,
		playerVars: {
			autoplay: 0,
			controls: 1,    // Keep native YT controls (play, pause, seek bar)
			mute: 1,        // Start muted — Kokoro audio replaces the audio track
			rel: 0,         // Don't show related videos at the end
			modestbranding: 1,
			iv_load_policy: 3, // Disable video annotations
		},
		events,
	});
}
