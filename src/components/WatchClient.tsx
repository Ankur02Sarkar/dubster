"use client";

import { useState, useRef, useCallback } from "react";
import { TtsEngine, type TtsEngineHandle } from "@/components/TtsEngine";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import type { TranscriptSegment } from "@/app/watch/[videoId]/page";

interface WatchClientProps {
	videoId: string;
	segments: TranscriptSegment[];
}

/**
 * Client shell for the watch page.
 *
 * Owns the shared `currentTime` state so both TtsEngine and TranscriptPanel
 * can stay in sync without lifting state into the RSC page.
 *
 * Responsibility split:
 * - TtsEngine  → muted video + audio pipeline (owns the YT player)
 * - TranscriptPanel → display + click-to-seek UI
 * - WatchClient → shared currentTime, seek coordination
 */
export function WatchClient({ videoId, segments }: WatchClientProps) {
	const [currentTime, setCurrentTime] = useState(0);
	const ttsRef = useRef<TtsEngineHandle>(null);

	// Called every 100ms by VideoPlayer's time poll
	const handleTimeUpdate = useCallback((t: number) => {
		setCurrentTime(t);
	}, []);

	// Called when user clicks a transcript segment
	// → seek the YouTube player AND reschedule audio
	const handleSeek = useCallback((seconds: number) => {
		ttsRef.current?.seekTo(seconds);
	}, []);

	return (
		<>
			{/* Left column: video + TTS pipeline */}
			<section className="flex-1 flex flex-col gap-4 p-4 lg:p-6 min-w-0">
				<TtsEngine
					ref={ttsRef}
					videoId={videoId}
					segments={segments}
					onTimeUpdate={handleTimeUpdate}
				/>

				{/* Info bar */}
				<div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
					<div className="size-2 rounded-full bg-primary animate-pulse" />
					<span className="text-xs text-muted-foreground">
						Press play to load the AI voice · audio generates in your browser
					</span>
					<span className="ml-auto text-xs text-muted-foreground font-mono">
						{segments.length} segments
					</span>
				</div>
			</section>

			{/* Right column: transcript panel */}
			<aside className="lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-border flex flex-col">
				<div className="px-4 py-3 border-b border-border shrink-0">
					<h2 className="text-sm font-semibold">Transcript</h2>
					<p className="text-xs text-muted-foreground mt-0.5">
						{segments.length} segments · click to seek
					</p>
				</div>
				<TranscriptPanel
					segments={segments}
					currentTime={currentTime}
					onSeek={handleSeek}
				/>
			</aside>
		</>
	);
}
