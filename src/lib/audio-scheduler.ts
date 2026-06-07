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
 * - Progressive scheduling: as each buffer is generated it can be scheduled immediately via
 *   scheduleOne(), without needing to cancel+reschedule everything.
 */

import type { TranscriptSegment } from "@/app/watch/[videoId]/page";

// The minimum positive scheduling delay (seconds) to avoid
// AudioContext "start time in the past" warnings.
const MIN_SCHEDULE_DELAY_S = 0.01;

interface ScheduledSource {
	source: AudioBufferSourceNode;
	segmentIndex: number;
}

export class AudioScheduler {
	private ctx: AudioContext;
	private scheduled: ScheduledSource[] = [];
	// Tracks which segment indices have already been scheduled so we
	// don't double-schedule when calling scheduleOne() incrementally.
	private scheduledIndices: Set<number> = new Set();

	constructor(ctx: AudioContext) {
		this.ctx = ctx;
	}

	get audioContext(): AudioContext {
		return this.ctx;
	}

	/**
	 * Schedules ALL available (non-null) segments from `videoCurrentTimeSeconds` onward.
	 * Skips any index already in scheduledIndices.
	 * Call this after a seek or on initial play.
	 */
	scheduleFrom(
		segments: TranscriptSegment[],
		buffers: (AudioBuffer | null)[],
		videoCurrentTimeSeconds: number,
	): void {
		const now = this.ctx.currentTime;

		for (let i = 0; i < segments.length; i++) {
			if (this.scheduledIndices.has(i)) continue;
			const seg = segments[i];
			const buf = buffers[i];
			if (!buf) continue;

			const segStartS = seg.offset / 1000;
			const delayS = segStartS - videoCurrentTimeSeconds;

			// Skip segments already fully in the past
			if (delayS < -(seg.duration / 1000)) continue;

			this._scheduleBuffer(buf, i, now + Math.max(MIN_SCHEDULE_DELAY_S, delayS));
		}
	}

	/**
	 * Schedules a single newly-generated segment immediately, if:
	 * - it hasn't been scheduled yet
	 * - it's not fully in the past
	 * - the AudioContext is running (i.e. video is playing)
	 *
	 * Call this from the background generation loop each time a new buffer
	 * becomes available to give the user dubbed audio progressively.
	 */
	scheduleOne(
		index: number,
		segment: TranscriptSegment,
		buffer: AudioBuffer,
		videoCurrentTimeSeconds: number,
	): void {
		if (this.scheduledIndices.has(index)) return;
		if (this.ctx.state !== "running") return;

		const now = this.ctx.currentTime;
		const segStartS = segment.offset / 1000;
		const delayS = segStartS - videoCurrentTimeSeconds;

		// Only schedule if not fully in the past
		if (delayS < -(segment.duration / 1000)) return;

		this._scheduleBuffer(buffer, index, now + Math.max(MIN_SCHEDULE_DELAY_S, delayS));
	}

	private _scheduleBuffer(buffer: AudioBuffer, index: number, startAt: number): void {
		const source = this.ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(this.ctx.destination);
		source.start(startAt);
		this.scheduled.push({ source, segmentIndex: index });
		this.scheduledIndices.add(index);
	}

	/**
	 * Stops and disconnects all pending scheduled sources, clears tracking.
	 * Must be called on every seek event before calling scheduleFrom() again.
	 */
	cancelAll(): void {
		for (const { source } of this.scheduled) {
			try {
				source.stop();
			} catch {
				// stop() throws if the source was never started or already finished
			}
			source.disconnect();
		}
		this.scheduled = [];
		this.scheduledIndices.clear();
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

	get scheduledCount(): number {
		return this.scheduled.length;
	}
}

// ---------------------------------------------------------------------------
// Singleton management
// ---------------------------------------------------------------------------

let _scheduler: AudioScheduler | null = null;

/**
 * Returns the shared AudioScheduler, creating the AudioContext on first call.
 * The AudioContext starts suspended — call scheduler.resume() inside a user gesture.
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
