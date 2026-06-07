"use client";

import { useEffect, useRef } from "react";
import { useYouTubePlayer, DRIFT_THRESHOLD_S } from "@/hooks/useYouTubePlayer";
import { cn } from "@/lib/utils";

const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_ENDED = 0;

const PLAYER_ELEMENT_ID = "yt-player";

export type VideoOverlayState = "loading" | "priming" | "error" | null;

export interface VideoPlayerProps {
	videoId: string;
	/**
	 * When true the IFrame is non-interactive — a semi-transparent overlay
	 * blocks clicks and a status chip is shown until the engine is ready.
	 */
	disabled?: boolean;
	/** Controls which chip variant to show on the disabled overlay */
	overlayState?: VideoOverlayState;
	/** 0–100 model download progress (shown during "loading") */
	loadProgress?: number;
	/** Segments generated so far during priming */
	primingCount?: number;
	primingTotal?: number;
	/** Overall generation progress */
	generatedCount?: number;
	totalCount?: number;
	/** Error message when overlayState === "error" */
	errorMessage?: string | null;
	/** 100ms time poll callback */
	onTimeUpdate?: (currentTimeSeconds: number) => void;
	onPlay?: () => void;
	onPause?: () => void;
	onResume?: () => void;
	onEnded?: () => void;
	onSeek?: (newTimeSeconds: number) => void;
	onPlayerReady?: (player: YT.Player) => void;
	className?: string;
}

export function VideoPlayer({
	videoId,
	disabled = false,
	overlayState = null,
	loadProgress = 0,
	primingCount = 0,
	primingTotal = 5,
	generatedCount = 0,
	totalCount = 0,
	errorMessage,
	onTimeUpdate,
	onPlay,
	onPause,
	onResume,
	onSeek,
	onEnded,
	onPlayerReady,
	className,
}: VideoPlayerProps) {
	const { isReady, playerState, currentTime, playerRef } = useYouTubePlayer(
		videoId,
		PLAYER_ELEMENT_ID,
	);

	// Notify parent once the player is ready
	useEffect(() => {
		if (isReady && playerRef.current) {
			onPlayerReady?.(playerRef.current);
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isReady]);

	// Seek detection
	const prevTimeRef = useRef<number>(0);
	useEffect(() => {
		if (!isReady) return;
		const delta = Math.abs(currentTime - prevTimeRef.current);
		if (delta > DRIFT_THRESHOLD_S && prevTimeRef.current !== 0) {
			onSeek?.(currentTime);
		}
		prevTimeRef.current = currentTime;
		onTimeUpdate?.(currentTime);
	}, [currentTime, isReady, onSeek, onTimeUpdate]);

	// State change forwarding
	useEffect(() => {
		if (playerState === null) return;
		if (playerState === YT_PLAYING) {
			playerRef.current?.mute();
			onPlay?.();
		} else if (playerState === YT_PAUSED || playerState === YT_BUFFERING) {
			onPause?.();
		} else if (playerState === YT_ENDED) {
			onEnded?.();
		}
	}, [playerState, onPlay, onPause, onResume, onEnded, playerRef]);

	return (
		<div className={cn("relative w-full aspect-video rounded-xl overflow-hidden bg-black", className)}>
			{/* IFrame loading skeleton */}
			{!isReady && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/30 animate-pulse z-10">
					<div className="size-12 rounded-full bg-muted" />
					<div className="h-3 w-24 rounded bg-muted" />
				</div>
			)}

			{/* YouTube IFrame mount point */}
			<div
				id={PLAYER_ELEMENT_ID}
				className={cn("w-full h-full transition-opacity duration-500", disabled && "opacity-60")}
				aria-label="YouTube video player (muted)"
			/>

			{/* Disabled overlay — blocks interaction while engine is not ready */}
			{disabled && isReady && (
				<div className="absolute inset-0 z-20 pointer-events-auto cursor-not-allowed">
					{/* Status chip — top-left */}
					<div className="absolute top-3 left-3">
						{overlayState === "error" ? (
							<ErrorChip message={errorMessage} />
						) : overlayState === "priming" ? (
							<PrimingChip count={primingCount} total={primingTotal} />
						) : (
							<LoadingChip progress={loadProgress} />
						)}
					</div>

					{/* Centre blocker — prevents accidental play clicks */}
					<div className="absolute inset-0 flex items-center justify-center">
						{/* invisible hit-blocker; chip above gives context */}
					</div>
				</div>
			)}

			{/* Background generation badge — shown after playable, non-blocking */}
			{!disabled && generatedCount > 0 && generatedCount < totalCount && (
				<div className="absolute bottom-3 right-3 z-10 pointer-events-none">
					<GeneratingBadge generatedCount={generatedCount} totalCount={totalCount} />
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Overlay chip variants
// ---------------------------------------------------------------------------

function LoadingChip({ progress }: { progress: number }) {
	return (
		<div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm text-white rounded-full px-3 py-1.5 text-xs font-medium shadow-lg">
			<svg className="animate-spin size-3 shrink-0" viewBox="0 0 12 12" fill="none" aria-hidden="true">
				<circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
				<path d="M6 1.5 a4.5 4.5 0 0 1 4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			</svg>
			<span>Downloading voice model… {progress > 0 ? `${progress}%` : ""}</span>
		</div>
	);
}

function PrimingChip({ count, total }: { count: number; total: number }) {
	const pct = total > 0 ? Math.round((count / total) * 100) : 0;
	return (
		<div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm text-white rounded-full px-3 py-1.5 text-xs font-medium shadow-lg">
			<svg className="animate-spin size-3 shrink-0" viewBox="0 0 12 12" fill="none" aria-hidden="true">
				<circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
				<path d="M6 1.5 a4.5 4.5 0 0 1 4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			</svg>
			<span>Preparing voice… {count}/{total}</span>
			{/* Mini progress bar */}
			<div className="w-12 h-1 rounded-full bg-white/20 overflow-hidden">
				<div
					className="h-full rounded-full bg-primary transition-all duration-300"
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}

function ErrorChip({ message }: { message?: string | null }) {
	return (
		<div className="flex items-center gap-2 bg-destructive/80 backdrop-blur-sm text-white rounded-full px-3 py-1.5 text-xs font-medium shadow-lg max-w-xs">
			<span className="shrink-0">✕</span>
			<span className="truncate">{message ?? "Voice engine failed"}</span>
		</div>
	);
}

function GeneratingBadge({ generatedCount, totalCount }: { generatedCount: number; totalCount: number }) {
	const pct = totalCount > 0 ? Math.round((generatedCount / totalCount) * 100) : 0;
	return (
		<div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white/80 rounded-full px-2.5 py-1 text-[11px] font-medium">
			<span className="relative flex size-1.5">
				<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
				<span className="relative inline-flex rounded-full size-1.5 bg-primary" />
			</span>
			<span>Dubbing {pct}%</span>
		</div>
	);
}
