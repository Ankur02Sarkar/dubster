"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "@/app/watch/[videoId]/page";

interface TranscriptPanelProps {
	segments: TranscriptSegment[];
	/** Current video playback position in seconds */
	currentTime: number;
	/** Called when the user clicks a segment to seek there */
	onSeek: (timeSeconds: number) => void;
	className?: string;
}

/**
 * Scrollable transcript panel with:
 * - Active segment highlighted in primary colour
 * - Smooth auto-scroll to keep the active segment visible
 * - Click-to-seek on any segment row
 */
export function TranscriptPanel({
	segments,
	currentTime,
	onSeek,
	className,
}: TranscriptPanelProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const activeRowRef = useRef<HTMLDivElement>(null);
	const userScrollingRef = useRef(false);
	const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Derive the active segment index from currentTime.
	// A segment is "active" if the playhead is within [offset, offset+duration).
	const activeIndex = useMemo(() => {
		const currentMs = currentTime * 1000;
		// Walk backwards so we pick the latest segment that has started
		for (let i = segments.length - 1; i >= 0; i--) {
			if (currentMs >= segments[i].offset) return i;
		}
		return -1;
	}, [segments, currentTime]);

	// Auto-scroll: when the active segment changes, scroll it into the middle
	// of the panel — but only if the user isn't manually scrolling.
	useEffect(() => {
		if (activeIndex === -1) return;
		if (userScrollingRef.current) return;

		activeRowRef.current?.scrollIntoView({
			behavior: "smooth",
			block: "center",
		});
	}, [activeIndex]);

	// Detect manual scroll: suppress auto-scroll for 3s after the user touches the panel
	const handleScroll = useCallback(() => {
		userScrollingRef.current = true;
		if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
		scrollTimerRef.current = setTimeout(() => {
			userScrollingRef.current = false;
		}, 3000);
	}, []);

	// Clean up the scroll debounce timer on unmount
	useEffect(() => {
		return () => {
			if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
		};
	}, []);

	return (
		<div
			ref={scrollRef}
			onScroll={handleScroll}
			className={cn("flex-1 overflow-y-auto p-2 scroll-smooth", className)}
		>
			{segments.map((seg, i) => {
				const isActive = i === activeIndex;
				const isPast = i < activeIndex;

				return (
					<div
						key={i}
						ref={isActive ? activeRowRef : null}
						role="button"
						tabIndex={0}
						aria-label={`Seek to ${formatTime(seg.offset)}: ${seg.text}`}
						onClick={() => onSeek(seg.offset / 1000)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onSeek(seg.offset / 1000);
							}
						}}
						className={cn(
							"flex gap-3 items-start px-2 py-2 rounded-lg transition-colors duration-150 cursor-pointer group",
							isActive
								? "bg-primary/10 border border-primary/20"
								: "hover:bg-muted/50 border border-transparent",
						)}
					>
						{/* Timestamp */}
						<span
							className={cn(
								"shrink-0 text-[11px] font-mono mt-0.5 w-10 text-right transition-colors",
								isActive
									? "text-primary font-semibold"
									: isPast
										? "text-muted-foreground/50"
										: "text-muted-foreground group-hover:text-primary",
							)}
						>
							{formatTime(seg.offset)}
						</span>

						{/* Text */}
						<p
							className={cn(
								"text-sm leading-snug flex-1 transition-colors",
								isActive
									? "text-foreground font-medium"
									: isPast
										? "text-muted-foreground/60"
										: "text-foreground/80",
							)}
						>
							{seg.text}
						</p>

						{/* Active indicator dot */}
						{isActive && (
							<span className="shrink-0 mt-1.5">
								<span className="relative flex size-1.5">
									<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
									<span className="relative inline-flex rounded-full size-1.5 bg-primary" />
								</span>
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}
