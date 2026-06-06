import { NextRequest, NextResponse } from "next/server";
import {
	YoutubeTranscript,
	YoutubeTranscriptDisabledError,
	YoutubeTranscriptNotAvailableError,
	YoutubeTranscriptNotAvailableLanguageError,
	YoutubeTranscriptTooManyRequestError,
	YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";

// youtube-transcript uses Node.js internals — must NOT use the edge runtime
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	const videoId = request.nextUrl.searchParams.get("videoId");

	if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
		return NextResponse.json(
			{ error: "Missing or invalid videoId parameter." },
			{ status: 400 },
		);
	}

	try {
		const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
			lang: "en",
		});

		if (!transcript || transcript.length === 0) {
			return NextResponse.json(
				{ error: "No transcript segments found for this video." },
				{ status: 404 },
			);
		}

		// Sanitise: strip HTML entities that occasionally leak through
		const segments = transcript.map((s) => ({
			text: s.text.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code))).trim(),
			offset: s.offset,   // milliseconds from video start
			duration: s.duration, // milliseconds
		}));

		return NextResponse.json(segments, {
			headers: {
				// Cache at the edge for 1 hour — transcripts rarely change
				"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
			},
		});
	} catch (err) {
		// Surface user-friendly error codes so the UI can show the right message
		if (err instanceof YoutubeTranscriptDisabledError) {
			return NextResponse.json(
				{ error: "Subtitles are disabled for this video.", code: "DISABLED" },
				{ status: 404 },
			);
		}
		if (err instanceof YoutubeTranscriptNotAvailableError) {
			return NextResponse.json(
				{ error: "No captions are available for this video.", code: "NO_CAPTIONS" },
				{ status: 404 },
			);
		}
		if (err instanceof YoutubeTranscriptNotAvailableLanguageError) {
			return NextResponse.json(
				{ error: "No English captions available for this video.", code: "NO_EN_CAPTIONS" },
				{ status: 404 },
			);
		}
		if (err instanceof YoutubeTranscriptVideoUnavailableError) {
			return NextResponse.json(
				{ error: "This video is unavailable or private.", code: "UNAVAILABLE" },
				{ status: 404 },
			);
		}
		if (err instanceof YoutubeTranscriptTooManyRequestError) {
			return NextResponse.json(
				{ error: "YouTube rate limit hit. Try again in a few minutes.", code: "RATE_LIMITED" },
				{ status: 429 },
			);
		}

		console.error("[transcript] Unexpected error:", err);
		return NextResponse.json(
			{ error: "Failed to fetch transcript. The video may not have captions.", code: "UNKNOWN" },
			{ status: 500 },
		);
	}
}
