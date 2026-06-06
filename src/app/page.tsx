import type { Metadata } from "next";
import { UrlForm } from "@/components/UrlForm";

export const metadata: Metadata = {
	title: "Dubster — AI Video Dubbing in Your Browser",
};

export default function HomePage() {
	return (
		<div className="min-h-screen flex flex-col">
			{/* Header */}
			<header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
				<div className="flex items-center gap-2">
					<span className="text-primary font-bold text-xl tracking-tight">dubster</span>
				</div>
				<span className="text-xs text-muted-foreground hidden sm:block">
					AI dubbing · 100% in your browser · Free
				</span>
			</header>

			{/* Hero */}
			<main className="flex-1 flex flex-col items-center justify-center px-4 py-20 gap-10">
				{/* Badge */}
				<div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary font-medium">
					<span className="relative flex size-2">
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
						<span className="relative inline-flex rounded-full size-2 bg-primary" />
					</span>
					Powered by Kokoro TTS · Runs entirely in your browser
				</div>

				{/* Headline */}
				<div className="flex flex-col items-center gap-4 text-center max-w-2xl">
					<h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-tight">
						Hear any YouTube video
						<br />
						<span className="text-primary">in a new voice</span>
					</h1>
					<p className="text-muted-foreground text-base sm:text-lg max-w-md">
						Paste a YouTube URL. We extract the transcript, generate dubbed audio
						with an AI voice model, and play it in sync — all in your browser, no
						servers, no cost.
					</p>
				</div>

				{/* URL Input */}
				<UrlForm />

				{/* Supported format hints */}
				<p className="text-xs text-muted-foreground text-center">
					Supports{" "}
					<code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">
						youtube.com/watch?v=…
					</code>{" "}
					·{" "}
					<code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">
						youtu.be/…
					</code>{" "}
					· bare video IDs
				</p>
			</main>

			{/* How it works */}
			<section className="border-t border-border/50 px-4 py-14">
				<div className="max-w-3xl mx-auto">
					<h2 className="text-center text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-10">
						How it works
					</h2>
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
						{STEPS.map((step, i) => (
							<div key={i} className="flex flex-col gap-3 items-center text-center p-5 rounded-xl bg-card border border-border">
								<div className="size-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm">
									{i + 1}
								</div>
								<h3 className="font-semibold text-sm">{step.title}</h3>
								<p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Footer */}
			<footer className="border-t border-border/50 px-6 py-4 flex items-center justify-between text-xs text-muted-foreground">
				<span>© 2026 Dubster</span>
				<span>Built with Kokoro TTS · Open source</span>
			</footer>
		</div>
	);
}

const STEPS = [
	{
		title: "Paste a YouTube URL",
		desc: "Drop in any YouTube link. We grab the video's transcript from YouTube's servers.",
	},
	{
		title: "AI voice loads once",
		desc: "A ~92 MB Kokoro TTS model downloads to your browser and is cached — subsequent visits are instant.",
	},
	{
		title: "Watch with a new voice",
		desc: "The original audio is muted. The AI reads the transcript in sync with the video, segment by segment.",
	},
];
