import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// kokoro-js and onnxruntime packages are browser-only (WebGPU/WASM).
	// They are loaded via next/dynamic ssr:false so the NFT tracer never
	// follows them into the server bundle. Listing them here as an extra
	// safety net prevents any accidental server-side import from being bundled.
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
