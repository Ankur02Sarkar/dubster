"use client";

/**
 * Thin client-component wrapper that dynamically imports WatchClient with
 * `ssr: false`, breaking the static import chain so Next.js NFT tracer
 * never follows kokoro-js / onnxruntime-node into the server bundle.
 *
 * Must be a 'use client' component — next/dynamic with ssr:false is not
 * allowed in Server Components (RSC).
 */

import dynamic from "next/dynamic";
import type { TranscriptSegment } from "@/app/watch/[videoId]/page";

const WatchClient = dynamic(
	() => import("@/components/WatchClient").then((m) => m.WatchClient),
	{
		ssr: false,
		// Show nothing while the client JS loads — the video skeleton in
		// VideoPlayer handles the perceived loading state.
		loading: () => (
			<div className="flex-1 flex items-center justify-center">
				<div className="size-2 rounded-full bg-primary animate-pulse" />
			</div>
		),
	},
);

interface WatchClientLoaderProps {
	videoId: string;
	segments: TranscriptSegment[];
}

export function WatchClientLoader({ videoId, segments }: WatchClientLoaderProps) {
	return <WatchClient videoId={videoId} segments={segments} />;
}
