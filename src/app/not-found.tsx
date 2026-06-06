import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Page not found",
};

export default function NotFound() {
	return (
		<div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
			<div className="flex flex-col gap-1">
				<p className="text-7xl font-bold text-primary/30 font-mono">404</p>
				<h1 className="text-xl font-semibold">Page not found</h1>
				<p className="text-muted-foreground text-sm">
					This page doesn&apos;t exist. Try pasting a YouTube URL instead.
				</p>
			</div>

			<Link
				href="/"
				className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
			>
				← Back to Dubster
			</Link>
		</div>
	);
}
