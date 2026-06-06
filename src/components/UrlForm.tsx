"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function extractVideoId(input: string): string | null {
	const str = input.trim();

	// Standard watch URL: https://www.youtube.com/watch?v=VIDEO_ID
	const watchMatch = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
	if (watchMatch) return watchMatch[1];

	// Short URL: https://youtu.be/VIDEO_ID
	const shortMatch = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
	if (shortMatch) return shortMatch[1];

	// Embed URL: https://www.youtube.com/embed/VIDEO_ID
	const embedMatch = str.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
	if (embedMatch) return embedMatch[1];

	// Bare 11-char video ID
	if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;

	return null;
}

export function UrlForm() {
	const router = useRouter();
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);

		const videoId = extractVideoId(value);
		if (!videoId) {
			setError("Paste a valid YouTube URL or video ID.");
			return;
		}

		setLoading(true);
		router.push(`/watch/${videoId}`);
	}

	return (
		<form onSubmit={handleSubmit} className="w-full max-w-xl flex flex-col gap-3">
			<div
				className={cn(
					"flex items-center gap-2 rounded-xl border bg-card px-4 py-2 shadow-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
					error ? "border-destructive focus-within:border-destructive focus-within:ring-destructive/20" : "border-border",
				)}
			>
				{/* YouTube icon via SVG inline — no external dependency */}
				<svg
					className="shrink-0 text-muted-foreground size-5"
					viewBox="0 0 24 24"
					fill="currentColor"
					aria-hidden="true"
				>
					<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
				</svg>
				<input
					type="text"
					value={value}
					onChange={(e) => {
						setValue(e.target.value);
						if (error) setError(null);
					}}
					placeholder="Paste a YouTube URL or video ID…"
					className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
					autoComplete="off"
					spellCheck={false}
					disabled={loading}
				/>
			</div>

			{error && (
				<p className="text-destructive text-xs px-1">{error}</p>
			)}

			<Button
				type="submit"
				size="lg"
				disabled={loading || !value.trim()}
				className="w-full"
			>
				{loading ? "Loading…" : "Dub this video"}
			</Button>
		</form>
	);
}
