import type { Metadata } from "next";
import Link from "next/link";
import { WatchClient } from "@/components/WatchClient";

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

			<main className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden" style={{ height: "calc(100vh - 49px)" }}>
				{/*
				 * WatchClient is the client shell that owns shared currentTime state
				 * and wires TtsEngine ↔ TranscriptPanel together.
				 */}
				<WatchClient videoId={videoId} segments={segments} />
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
