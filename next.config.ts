import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// These packages contain native .node binaries or browser-only WASM that
	// must NOT be bundled into the CF Workers server function.
	// kokoro-js / onnxruntime-web / onnxruntime-node are client-only (browser).
	// Marking them external prevents the bundler from touching them server-side.
	serverExternalPackages: [
		"kokoro-js",
		"onnxruntime-web",
		"onnxruntime-node",
		"@huggingface/transformers",
	],
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
