/**
 * Kokoro TTS wrapper.
 *
 * Browser-only. Never import this in RSC, route handlers, or any server code.
 * kokoro-js uses ONNX Runtime Web which requires browser globals.
 */

import { KokoroTTS } from "kokoro-js";

// The ONNX model ID on HuggingFace Hub.
// q8 = ~92MB quantized — best balance of quality and download size.
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const MODEL_DTYPE = "q8" as const;

// Default voice. af_heart is the highest-quality American English female voice.
export const DEFAULT_VOICE = "af_heart" as const;

// Singleton — one model instance per browser session.
let ttsInstance: KokoroTTS | null = null;
let loadPromise: Promise<KokoroTTS> | null = null;

export type ProgressCallback = (loaded: number, total: number, percent: number) => void;

/**
 * Initialises the Kokoro TTS model.
 *
 * - Downloads the ~92MB ONNX model on first call (cached by the browser after).
 * - Subsequent calls return the cached singleton immediately.
 * - Uses WebGPU when available, falls back to WASM automatically.
 *
 * @param onProgress  Optional callback fired during model download/load.
 */
export async function initTTS(onProgress?: ProgressCallback): Promise<KokoroTTS> {
	if (ttsInstance) return ttsInstance;

	// Prevent multiple concurrent initialisations
	if (loadPromise) return loadPromise;

	loadPromise = KokoroTTS.from_pretrained(MODEL_ID, {
		dtype: MODEL_DTYPE,
		// webgpu gives near-real-time inference; kokoro-js falls back to wasm automatically
		device: "webgpu",
		progress_callback: (progress) => {
			if (!onProgress) return;
			// The transformers.js progress object has varying shapes depending on the stage.
			// We normalise it to a 0–100 percentage.
			const p = progress as Record<string, unknown>;
			if (typeof p.progress === "number") {
				const loaded = typeof p.loaded === "number" ? p.loaded : 0;
				const total = typeof p.total === "number" ? p.total : 0;
				onProgress(loaded, total, Math.round(p.progress));
			}
		},
	}).then((instance) => {
		ttsInstance = instance;
		return instance;
	});

	return loadPromise;
}

/**
 * Generates a Web Audio API AudioBuffer for a single transcript segment.
 *
 * @param tts   The loaded KokoroTTS instance (from initTTS)
 * @param text  The segment text to synthesise
 * @param ctx   The shared AudioContext
 * @param voice Optional voice override (defaults to DEFAULT_VOICE)
 */
export async function generateSegmentAudio(
	tts: KokoroTTS,
	text: string,
	ctx: AudioContext,
	voice: string = DEFAULT_VOICE,
): Promise<AudioBuffer> {
	// The GenerateOptions type from kokoro-js uses a specific voice union — cast through unknown
	const raw = await tts.generate(text, { voice: voice } as Parameters<typeof tts.generate>[1]);

	// raw.audio  → Float32Array of PCM samples (mono, may use SharedArrayBuffer internally)
	// raw.sampling_rate → typically 24000 Hz for Kokoro
	// Copy into a plain Float32Array to satisfy AudioBuffer.copyToChannel's ArrayBuffer constraint
	const pcm = new Float32Array(raw.audio);
	const buffer = ctx.createBuffer(1, pcm.length, raw.sampling_rate);
	buffer.copyToChannel(pcm, 0);
	return buffer;
}

/**
 * Returns true if a KokoroTTS model is already loaded in memory.
 * Useful to skip the loading screen on revisit within the same session.
 */
export function isTTSReady(): boolean {
	return ttsInstance !== null;
}
