"use client";

import { cn } from "@/lib/utils";
import type { TtsStatus } from "@/hooks/useTtsEngine";

interface LoadingOverlayProps {
	status: TtsStatus;
	loadProgress: number;   // 0–100 model download
	generatedCount: number;
	totalCount: number;
	error: string | null;
	/** Called when the user clicks "Try again" after an error */
	onRetry?: () => void;
	className?: string;
}

/**
 * Overlay shown on the watch page while the TTS model is loading or audio
 * is being generated. Transparent once status === "ready".
 */
export function LoadingOverlay({
	status,
	loadProgress,
	generatedCount,
	totalCount,
	error,
	onRetry,
	className,
}: LoadingOverlayProps) {
	// Nothing to show once ready or idle
	if (status === "idle" || status === "ready") return null;

	const isError = status === "error";
	const isLoading = status === "loading";
	const isGenerating = status === "generating";

	const genPercent = totalCount > 0 ? Math.round((generatedCount / totalCount) * 100) : 0;

	return (
		<div
			className={cn(
				"absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 rounded-xl",
				"bg-background/90 backdrop-blur-sm",
				className,
			)}
		>
			{isError ? (
				<ErrorState message={error} onRetry={onRetry} />
			) : (
				<ProgressState
					isLoading={isLoading}
					isGenerating={isGenerating}
					loadProgress={loadProgress}
					genPercent={genPercent}
					generatedCount={generatedCount}
					totalCount={totalCount}
				/>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

function ProgressState({
	isLoading,
	isGenerating,
	loadProgress,
	genPercent,
	generatedCount,
	totalCount,
}: {
	isLoading: boolean;
	isGenerating: boolean;
	loadProgress: number;
	genPercent: number;
	generatedCount: number;
	totalCount: number;
}) {
	const percent = isLoading ? loadProgress : genPercent;
	const label = isLoading
		? "Downloading voice model…"
		: `Generating dubbed audio… ${generatedCount} / ${totalCount}`;
	const sublabel = isLoading
		? `~92 MB · cached after first download · ${loadProgress}%`
		: `${genPercent}% complete`;

	return (
		<>
			{/* Spinner */}
			<div className="relative size-14">
				<svg
					className="animate-spin text-primary size-14"
					viewBox="0 0 56 56"
					fill="none"
					aria-hidden="true"
				>
					<circle
						cx="28" cy="28" r="24"
						stroke="currentColor"
						strokeWidth="4"
						strokeOpacity="0.15"
					/>
					<path
						d="M28 4 a24 24 0 0 1 24 24"
						stroke="currentColor"
						strokeWidth="4"
						strokeLinecap="round"
					/>
				</svg>
				<span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-semibold text-primary">
					{percent}%
				</span>
			</div>

			{/* Labels */}
			<div className="flex flex-col items-center gap-1 text-center px-6">
				<p className="text-sm font-semibold text-foreground">{label}</p>
				<p className="text-xs text-muted-foreground">{sublabel}</p>
			</div>

			{/* Progress bar */}
			<div className="w-56 h-1.5 rounded-full bg-muted overflow-hidden">
				<div
					className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
					style={{ width: `${percent}%` }}
				/>
			</div>

			{isLoading && (
				<p className="text-[11px] text-muted-foreground text-center max-w-xs px-4">
					The model runs entirely in your browser — nothing is sent to a server.
				</p>
			)}
		</>
	);
}

function ErrorState({
	message,
	onRetry,
}: {
	message: string | null;
	onRetry?: () => void;
}) {
	return (
		<>
			<div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center">
				<span className="text-destructive text-xl font-bold">✕</span>
			</div>
			<div className="flex flex-col items-center gap-1 text-center px-6">
				<p className="text-sm font-semibold text-foreground">Voice engine failed</p>
				{message && (
					<p className="text-xs text-muted-foreground max-w-xs">{message}</p>
				)}
			</div>
			{onRetry && (
				<button
					onClick={onRetry}
					className="text-xs text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
				>
					Try again
				</button>
			)}
		</>
	);
}
