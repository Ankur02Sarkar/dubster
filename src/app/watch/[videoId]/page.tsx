import type { Metadata } from "next";
import Link from "next/link";
import { WatchClientLoader } from "@/components/WatchClientLoader";

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
			: "https://dubster.ankur.codes");

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
// Error hint copy — surfaced below the error message for specific codes
// ---------------------------------------------------------------------------

const ERROR_HINTS: Record<string, string> = {
	DISABLED:       "The video owner has disabled captions. Try a video that has subtitles enabled.",
	NO_CAPTIONS:    "No captions were found for this video. Dubster needs captions to generate dubbed audio. Try a video that has auto-generated or manual subtitles.",
	NO_EN_CAPTIONS: "No English captions were found. Currently Dubster only supports English transcripts.",
	UNAVAILABLE:    "This video may be private, age-restricted, or region-locked.",
	RATE_LIMITED:   "YouTube is temporarily rate-limiting requests. Wait a minute then try again.",
};

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
		const hint = ERROR_HINTS[result.code ?? ""] ?? null;
		return (
			<div className="min-h-screen flex flex-col">
				<Header />
				<main className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-16 text-center">
					{/* Icon */}
					<div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
						<svg
							width="28" height="28" viewBox="0 0 28 28" fill="none"
							className="text-destructive" aria-hidden="true"
						>
							<circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1.5" />
							<path d="M14 8v7M14 18.5v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
						</svg>
					</div>

					{/* Message */}
					<div className="flex flex-col gap-2 max-w-sm">
						<h1 className="text-xl font-semibold">Can&apos;t dub this video</h1>
						<p className="text-muted-foreground text-sm leading-relaxed">{result.error}</p>
						{hint && (
							<p className="text-xs text-muted-foreground/70 bg-muted rounded-lg px-3 py-2 mt-1 leading-relaxed">
								{hint}
							</p>
						)}
					</div>

					{/* Actions */}
					<div className="flex flex-col sm:flex-row items-center gap-3">
						<Link
							href="/"
							className="inline-flex items-center gap-2 text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
						>
							← Try another video
						</Link>
						<a
							href="https://www.youtube.com"
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
						>
							Browse YouTube ↗
						</a>
					</div>
				</main>
			</div>
		);
	}

	const segments = result;

	return (
		<div className="h-screen flex flex-col overflow-hidden">
			<Header videoId={videoId} />

			<main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
				{/*
				 * WatchClient is the client shell that owns shared currentTime + ttsStatus
				 * state and wires TtsEngine ↔ TranscriptPanel together.
				 */}
				<WatchClientLoader videoId={videoId} segments={segments} />
			</main>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Sub-components (RSC)
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
