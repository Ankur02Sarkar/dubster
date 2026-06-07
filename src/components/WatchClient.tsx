"use client";

import { useState, useRef, useCallback } from "react";
import { TtsEngine, type TtsEngineHandle } from "@/components/TtsEngine";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import type { TranscriptSegment } from "@/app/watch/[videoId]/page";
import type { TtsStatus } from "@/hooks/useTtsEngine";
import { cn } from "@/lib/utils";

interface WatchClientProps {
	videoId: string;
	segments: TranscriptSegment[];
}

/**
 * Client shell for the watch page.
 *
 * Owns shared state:
 * - currentTime  → drives TranscriptPanel active highlight
 * - ttsStatus    → drives info bar label
 * - transcriptOpen → mobile drawer toggle
 *
 * Wires TtsEngine (ref) ↔ TranscriptPanel (seek callback).
 */
export function WatchClient({ videoId, segments }: WatchClientProps) {
	const [currentTime, setCurrentTime] = useState(0);
	const [ttsStatus, setTtsStatus] = useState<TtsStatus>("idle");
	const [transcriptOpen, setTranscriptOpen] = useState(false);
	const ttsRef = useRef<TtsEngineHandle>(null);

	const handleTimeUpdate = useCallback((t: number) => {
		setCurrentTime(t);
	}, []);

	const handleSeek = useCallback((seconds: number) => {
		ttsRef.current?.seekTo(seconds);
	}, []);

	const handleStatusChange = useCallback((s: TtsStatus) => {
		setTtsStatus(s);
	}, []);

	return (
		<>
			{/* ------------------------------------------------------------------ */}
			{/* Left column: video + info bar                                       */}
			{/* ------------------------------------------------------------------ */}
			<section className="flex-1 flex flex-col gap-3 p-3 sm:p-4 lg:p-6 min-w-0 overflow-hidden">
				<TtsEngine
					ref={ttsRef}
					videoId={videoId}
					segments={segments}
					onTimeUpdate={handleTimeUpdate}
					onStatusChange={handleStatusChange}
				/>

				{/* Dynamic info bar */}
				<InfoBar
					status={ttsStatus}
					segmentCount={segments.length}
					onToggleTranscript={() => setTranscriptOpen((o) => !o)}
					transcriptOpen={transcriptOpen}
				/>
			</section>

			{/* ------------------------------------------------------------------ */}
			{/* Right column / mobile drawer: transcript panel                      */}
			{/* ------------------------------------------------------------------ */}

			{/* Desktop sidebar — always visible on lg+ */}
			<aside className="hidden lg:flex lg:w-80 xl:w-96 border-l border-border flex-col overflow-hidden">
				<TranscriptHeader segmentCount={segments.length} />
				<TranscriptPanel
					segments={segments}
					currentTime={currentTime}
					onSeek={handleSeek}
				/>
			</aside>

			{/* Mobile drawer — slides up from bottom when toggled */}
			<div
				className={cn(
					"lg:hidden fixed inset-x-0 bottom-0 z-40 flex flex-col",
					"bg-background border-t border-border rounded-t-2xl shadow-2xl",
					"transition-transform duration-300 ease-out",
					transcriptOpen ? "translate-y-0" : "translate-y-full",
				)}
				style={{ maxHeight: "70vh" }}
				aria-hidden={!transcriptOpen}
			>
				{/* Drag handle */}
				<div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
					<div className="mx-auto w-10 h-1 rounded-full bg-border" />
				</div>
				<TranscriptHeader
					segmentCount={segments.length}
					onClose={() => setTranscriptOpen(false)}
				/>
				<TranscriptPanel
					segments={segments}
					currentTime={currentTime}
					onSeek={(s) => {
						handleSeek(s);
						setTranscriptOpen(false); // close drawer after seeking on mobile
					}}
				/>
			</div>

			{/* Backdrop for mobile drawer */}
			{transcriptOpen && (
				<div
					className="lg:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
					onClick={() => setTranscriptOpen(false)}
					aria-hidden="true"
				/>
			)}
		</>
	);
}

// ---------------------------------------------------------------------------
// Info bar — dynamic status label
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<TtsStatus, string> = {
	idle:       "Initialising voice engine…",
	loading:    "Downloading voice model (~92 MB, cached after first visit)…",
	priming:    "Preparing dubbed audio — almost ready…",
	playable:   "Ready · press play to start dubbing",
	generating: "Dubbing in progress · more audio generating in the background",
	ready:      "Fully dubbed · all segments ready",
	error:      "Voice engine encountered an error",
};

const STATUS_DOT: Record<TtsStatus, string> = {
	idle:       "bg-muted-foreground animate-pulse",
	loading:    "bg-primary animate-pulse",
	priming:    "bg-accent animate-pulse",
	playable:   "bg-primary",
	generating: "bg-primary animate-pulse",
	ready:      "bg-primary",
	error:      "bg-destructive",
};

function InfoBar({
	status,
	segmentCount,
	onToggleTranscript,
	transcriptOpen,
}: {
	status: TtsStatus;
	segmentCount: number;
	onToggleTranscript: () => void;
	transcriptOpen: boolean;
}) {
	return (
		<div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shrink-0">
			<span className={cn("size-2 rounded-full shrink-0", STATUS_DOT[status])} />
			<span className="text-xs text-muted-foreground truncate min-w-0 flex-1">
				{STATUS_LABEL[status]}
			</span>
			{/* Segment count — desktop */}
			<span className="hidden sm:block ml-auto text-xs text-muted-foreground font-mono shrink-0">
				{segmentCount} segments
			</span>
			{/* Transcript toggle — mobile only */}
			<button
				onClick={onToggleTranscript}
				className={cn(
					"lg:hidden shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors",
					transcriptOpen
						? "bg-primary text-primary-foreground"
						: "bg-muted text-muted-foreground hover:text-foreground",
				)}
				aria-expanded={transcriptOpen}
				aria-label="Toggle transcript"
			>
				{transcriptOpen ? "Close" : "Transcript"}
			</button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Transcript panel header (shared between desktop sidebar + mobile drawer)
// ---------------------------------------------------------------------------

function TranscriptHeader({
	segmentCount,
	onClose,
}: {
	segmentCount: number;
	onClose?: () => void;
}) {
	return (
		<div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
			<div>
				<h2 className="text-sm font-semibold">Transcript</h2>
				<p className="text-xs text-muted-foreground mt-0.5">
					{segmentCount} segments · click to seek
				</p>
			</div>
			{onClose && (
				<button
					onClick={onClose}
					className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
					aria-label="Close transcript"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
					</svg>
				</button>
			)}
		</div>
	);
}
