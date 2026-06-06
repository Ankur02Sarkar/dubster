import type { Metadata } from "next";
import Link from "next/link";
import { VideoPlayer } from "@/components/VideoPlayer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscriptSegment {
	text: string;
	offset: number;   // ms from video start
	duration: number; // ms
}

interface TranscriptApiError {
	error: string;
	code?: string;
}

// ---------------------------------------------------------------------------
// Data fetching (server-side — runs in CF Workers nodejs runtime)
// ---------------------------------------------------------------------------

async function fetchTranscript(videoId: string): Promise<TranscriptSegment[] | TranscriptApiError> {
	// Always use an absolute URL for server-side fetches in Next.js App Router
	const base =
		process.env.NEXT_PUBLIC_BASE_URL ??
		(process.env.NODE_ENV === "development"
			? "http://localhost:3000"
			: "https://dubster.app");

	const res = await fetch(`${base}/api/transcript?videoId=${videoId}`, {
		// Revalidate transcript cache every hour
		next: { revalidate: 3600 },
	});

	const data = await res.json();

	if (!res.ok) {
		return data as TranscriptApiError;
	}

	return data as TranscriptSegment[];
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
	params,
}: {
	params: Promise<{ videoId: string }>;
}): Promise<Metadata> {
	const { videoId } = await params;
	return {
		title: `Watch · ${videoId}`,
		description: `AI-dubbed playback for YouTube video ${videoId} — powered by Kokoro TTS, running entirely in your browser.`,
	};
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function WatchPage({
	params,
}: {
	params: Promise<{ videoId: string }>;
}) {
	const { videoId } = await params;

	const result = await fetchTranscript(videoId);

	// Error state — transcript unavailable
	if (!Array.isArray(result)) {
		return (
			<div className="min-h-screen flex flex-col">
				<Header />
				<main className="flex-1 flex flex-col items-center justify-center gap-6 px-4 text-center">
					<div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive text-2xl">
						✕
					</div>
					<div className="flex flex-col gap-2 max-w-md">
						<h1 className="text-xl font-semibold">Can&apos;t dub this video</h1>
						<p className="text-muted-foreground text-sm">{result.error}</p>
					</div>
					<Link
						href="/"
						className="text-primary text-sm underline underline-offset-4 hover:text-primary/80 transition-colors"
					>
						← Try another video
					</Link>
				</main>
			</div>
		);
	}

	const segments = result;

	return (
		<div className="min-h-screen flex flex-col">
			<Header videoId={videoId} />

			<main className="flex-1 flex flex-col lg:flex-row gap-0">
				{/* Left column: video + controls */}
				<section className="flex-1 flex flex-col gap-4 p-4 lg:p-6 min-w-0">
					{/* Video player — muted YouTube IFrame */}
					<VideoPlayer
						videoId={videoId}
						onTimeUpdate={(t) => {
							// Will be wired to the audio scheduler in Phase 4
							void t;
						}}
						onPlay={() => {
							// Will trigger audio resume in Phase 4
						}}
						onPause={() => {
							// Will trigger audio pause in Phase 4
						}}
						onSeek={(t) => {
							// Will trigger audio reschedule in Phase 4
							void t;
						}}
					/>

					{/* Status bar — placeholder until TTS engine is wired */}
					<div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
						<div className="size-2 rounded-full bg-muted-foreground animate-pulse" />
						<span className="text-xs text-muted-foreground">
							AI voice engine loading… (Phase 4)
						</span>
						<span className="ml-auto text-xs text-muted-foreground font-mono">
							{segments.length} segments
						</span>
					</div>
				</section>

				{/* Right column: transcript panel */}
				<aside className="lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-border flex flex-col">
					<div className="px-4 py-3 border-b border-border">
						<h2 className="text-sm font-semibold">Transcript</h2>
						<p className="text-xs text-muted-foreground mt-0.5">
							{segments.length} segments · click to seek
						</p>
					</div>
					<div className="flex-1 overflow-y-auto p-2">
						{segments.map((seg, i) => (
							<TranscriptSegmentRow key={i} segment={seg} index={i} />
						))}
					</div>
				</aside>
			</main>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Sub-components (RSC — no client interactivity yet; seek will be wired in Phase 5)
// ---------------------------------------------------------------------------

function Header({ videoId }: { videoId?: string }) {
	return (
		<header className="flex items-center gap-3 px-4 lg:px-6 py-3 border-b border-border/50 shrink-0">
			<Link
				href="/"
				className="text-primary font-bold text-lg tracking-tight hover:text-primary/80 transition-colors"
			>
				dubster
			</Link>
			{videoId && (
				<>
					<span className="text-border">·</span>
					<span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
						{videoId}
					</span>
				</>
			)}
			<div className="ml-auto">
				<a
					href={`https://www.youtube.com/watch?v=${videoId}`}
					target="_blank"
					rel="noopener noreferrer"
					className="text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					Open on YouTube ↗
				</a>
			</div>
		</header>
	);
}

function formatTime(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

function TranscriptSegmentRow({
	segment,
	index,
}: {
	segment: TranscriptSegment;
	index: number;
}) {
	return (
		<div
			data-index={index}
			className="flex gap-3 items-start px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
		>
			<span className="shrink-0 text-[11px] font-mono text-muted-foreground mt-0.5 w-10 text-right group-hover:text-primary transition-colors">
				{formatTime(segment.offset)}
			</span>
			<p className="text-sm text-foreground/90 leading-snug flex-1">
				{segment.text}
			</p>
		</div>
	);
}
