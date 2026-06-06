"use client";

import { useEffect } from "react";
import Link from "next/link";

interface ErrorProps {
	error: Error & { digest?: string };
	reset: () => void;
}

/**
 * Global error boundary for the App Router.
 * Catches unhandled runtime errors in the component tree and shows a
 * recovery UI instead of a blank page.
 *
 * Must be a Client Component (Next.js requirement).
 */
export default function GlobalError({ error, reset }: ErrorProps) {
	useEffect(() => {
		// Log to CF Workers observability / any future error tracking
		console.error("[GlobalError]", error);
	}, [error]);

	return (
		<div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center bg-background text-foreground">
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

			<div className="flex flex-col gap-2 max-w-sm">
				<h1 className="text-xl font-semibold">Something went wrong</h1>
				<p className="text-muted-foreground text-sm leading-relaxed">
					An unexpected error occurred. You can try recovering or go back to the home page.
				</p>
				{error.digest && (
					<p className="text-xs font-mono text-muted-foreground/60 bg-muted px-2 py-1 rounded mt-1">
						{error.digest}
					</p>
				)}
			</div>

			<div className="flex items-center gap-3">
				<button
					onClick={reset}
					className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
				>
					Try again
				</button>
				<Link
					href="/"
					className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
				>
					← Home
				</Link>
			</div>
		</div>
	);
}
