/**
 * Audio scheduling engine for gap-based dubbing sync.
 *
 * Browser-only. Never import in RSC or route handlers.
 *
 * Strategy:
 * - Each transcript segment is an independent AudioBufferSourceNode.
 * - Segments are scheduled at `AudioContext.currentTime + (segment.offset/1000 - videoCurrentTime)`.
 * - On seek: all pending sources are stopped and the scheduler re-runs from the new position.
 * - No speed-stretching — TTS audio plays at natural rate; gaps between segments are silence.
 */

import type { TranscriptSegment } from "@/app/watch/[videoId]/page";

// The minimum positive scheduling delay (seconds) to avoid
// AudioContext "start time in the past" warnings.
const MIN_SCHEDULE_DELAY_S = 0.01;

interface ScheduledSource {
	source: AudioBufferSourceNode;
	segmentIndex: number;
	scheduledAt: number; // AudioContext.currentTime when .start() was called
}

export class AudioScheduler {
	private ctx: AudioContext;
	private scheduled: ScheduledSource[] = [];

	constructor(ctx: AudioContext) {
		this.ctx = ctx;
	}

	get audioContext(): AudioContext {
		return this.ctx;
	}

	/**
	 * Schedules all segments whose offset is at or after `videoCurrentTimeSeconds`.
	 * Each segment is fired as an independent AudioBufferSourceNode.
	 *
	 * @param segments   Full transcript segment array
	 * @param buffers    Parallel array of AudioBuffers (null if not yet generated)
	 * @param videoCurrentTimeSeconds  The video's current playback position
	 */
	scheduleFrom(
		segments: TranscriptSegment[],
		buffers: (AudioBuffer | null)[],
		videoCurrentTimeSeconds: number,
	): void {
		const now = this.ctx.currentTime;

		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			const buf = buffers[i];
			if (!buf) continue; // not yet generated — skip

			const segStartS = seg.offset / 1000;
			const delayS = segStartS - videoCurrentTimeSeconds;

			// Skip segments already fully in the past
			if (delayS < -(seg.duration / 1000)) continue;

			const startAt = now + Math.max(MIN_SCHEDULE_DELAY_S, delayS);

			const source = this.ctx.createBufferSource();
			source.buffer = buf;
			source.connect(this.ctx.destination);
			source.start(startAt);

			this.scheduled.push({ source, segmentIndex: i, scheduledAt: startAt });
		}
	}

	/**
	 * Stops and disconnects all pending scheduled sources.
	 * Must be called on every seek event before calling scheduleFrom() again.
	 */
	cancelAll(): void {
		for (const { source } of this.scheduled) {
			try {
				source.stop();
			} catch {
				// stop() throws if the source was never started or already finished — ignore
			}
			source.disconnect();
		}
		this.scheduled = [];
	}

	/**
	 * Suspends the AudioContext (pauses all scheduled audio in place).
	 * Call when the video is paused or buffering.
	 */
	async suspend(): Promise<void> {
		if (this.ctx.state === "running") {
			await this.ctx.suspend();
		}
	}

	/**
	 * Resumes the AudioContext.
	 * Call when the video resumes playback.
	 */
	async resume(): Promise<void> {
		if (this.ctx.state === "suspended") {
			await this.ctx.resume();
		}
	}

	/** Number of currently scheduled (pending or playing) sources */
	get scheduledCount(): number {
		return this.scheduled.length;
	}
}

// ---------------------------------------------------------------------------
// Singleton management
// ---------------------------------------------------------------------------
// One AudioContext per page — browsers enforce a limit and garbage-collect extras.
// The context is created lazily on the first user gesture (browsers require this).

let _scheduler: AudioScheduler | null = null;

/**
 * Returns the shared AudioScheduler, creating the AudioContext on first call.
 * Must be called from a user-gesture handler (click, keydown, etc.).
 */
export function getAudioScheduler(): AudioScheduler {
	if (!_scheduler) {
		const ctx = new AudioContext();
		_scheduler = new AudioScheduler(ctx);
	}
	return _scheduler;
}

/**
 * Tears down the shared scheduler and closes the AudioContext.
 * Call when the watch page unmounts.
 */
export async function destroyAudioScheduler(): Promise<void> {
	if (_scheduler) {
		_scheduler.cancelAll();
		await _scheduler.audioContext.close();
		_scheduler = null;
	}
}
