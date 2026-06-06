# Dubster

AI video dubbing that runs entirely in your browser. Paste a YouTube URL — Dubster extracts the transcript, downloads a Kokoro TTS model client-side, generates dubbed audio segment-by-segment, and plays it in sync with the muted YouTube video. No servers, no accounts, free forever.

---

## Implementation Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Layout (dark mode, Figtree, SEO/OG), landing page + URL form | ✅ Done |
| **Phase 2** | Transcript proxy route, YouTube IFrame lib/hook, VideoPlayer, watch page RSC | ✅ Done |
| **Phase 3** | Kokoro TTS lib, AudioScheduler, useTtsEngine hook, LoadingOverlay, TtsEngine wiring | ✅ Done |
| **Phase 4** | TranscriptPanel (active highlight, auto-scroll, click-to-seek), WatchClient state shell | ✅ Done |
| **Phase 5** | Error states (per-code hints), mobile drawer transcript, dynamic info bar, viewport layout | ✅ Done |
| **Phase 6** | Deploy to Cloudflare, OG image, production hardening | 🔲 Next |

---

## Architecture

```
User pastes YouTube URL (landing page)
        ↓ router.push /watch/[videoId]
Watch Page (RSC, server-side)
        ↓ fetch /api/transcript?videoId=...
Transcript Route (CF Worker, nodejs runtime)
        ↓ youtube-transcript npm pkg → YouTube internal API
        ↓ [{text, offset, duration}] returned to RSC
        ↓ passed as props to TtsEngine (Client Component)

Browser (Client):
┌─────────────────────────────────────────────────────┐
│ TtsEngine (Client Component)                         │
│   ├── VideoPlayer (YouTube IFrame, always muted)     │
│   │     └── useYouTubePlayer hook                    │
│   │           ├── loadYouTubeIFrameAPI()             │
│   │           ├── getCurrentTime() poll 100ms        │
│   │           └── onStateChange events               │
│   ├── LoadingOverlay (progress bar, error state)     │
│   └── useTtsEngine hook                              │
│         ├── initTTS() → Kokoro ONNX ~92MB download  │
│         ├── generateSegmentAudio() per segment       │
│         └── AudioScheduler                           │
│               ├── scheduleFrom(segments, buffers, t) │
│               ├── cancelAll() on seek                │
│               └── suspend() / resume() on pause/play │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16.2.6 (App Router, RSC) |
| Runtime | Cloudflare Workers via `@opennextjs/cloudflare` |
| TTS | `kokoro-js` — Kokoro-82M ONNX, WebGPU + WASM fallback |
| Transcript | `youtube-transcript` — server-side Node.js route |
| Video | YouTube IFrame Player API |
| Audio sync | Web Audio API (`AudioContext`, `AudioBufferSourceNode`) |
| Styling | Tailwind v4 (CSS-only config), shadcn `base-maia`, Hugeicons |
| Fonts | Figtree (sans), Merriweather (serif), Ubuntu Mono (mono) |
| Theme | OKLCH — warm orange primary, deep wine/rose dark mode |

---

## Project Structure

```
src/
├── app/
│   ├── globals.css              # Tailwind v4 theme — ALL design tokens here
│   ├── layout.tsx               # Root layout — Figtree, dark class, SEO/OG metadata
│   ├── page.tsx                 # Landing page — URL input form
│   ├── watch/[videoId]/
│   │   └── page.tsx             # Watch page — RSC, server transcript fetch
│   └── api/transcript/
│       └── route.ts             # CF Worker (nodejs runtime) — transcript proxy
│
├── components/
│   ├── ui/button.tsx            # shadcn Button
│   ├── UrlForm.tsx              # URL input + videoId extraction (client)
│   ├── VideoPlayer.tsx          # YouTube IFrame + seek detection (client)
│   ├── TtsEngine.tsx            # Full dubbing pipeline orchestrator (client, forwardRef)
│   ├── LoadingOverlay.tsx       # Model download progress UI (client)
│   ├── TranscriptPanel.tsx      # Active highlight, auto-scroll, click-to-seek (client)
│   └── WatchClient.tsx          # Shared currentTime state shell (client)
│
├── lib/
│   ├── utils.ts                 # cn() helper
│   ├── tts.ts                   # Kokoro init + generateSegmentAudio()
│   ├── audio-scheduler.ts       # AudioScheduler class + singleton
│   └── youtube.ts               # IFrame API loader + createYTPlayer()
│
└── hooks/
    ├── useYouTubePlayer.ts      # IFrame state, 100ms polling, seek detection
    └── useTtsEngine.ts          # Model load, audio generation, scheduler wiring
```

---

## Getting Started

```bash
npm install
npm run dev        # Next.js dev server (Node.js runtime)
npm run preview    # Build + run on actual CF Workers runtime (test before deploy)
npm run deploy     # Build + deploy to Cloudflare
npm run lint       # ESLint
npm run cf-typegen # Regenerate cloudflare-env.d.ts after wrangler.jsonc changes
```

> **Important:** `npm run dev` uses Node.js polyfills. Always run `npm run preview` before deploying to catch CF Workers runtime incompatibilities.

---

## Key Design Decisions

| Decision | Reason |
|----------|--------|
| Client-side TTS (Kokoro) | $0 inference cost — runs on user's GPU/CPU via WebGPU/WASM |
| Server-side transcript proxy | `youtube-transcript` uses Node.js HTTP; CORS blocks browser |
| Gap-based audio scheduling | No cumulative drift — each segment is independently scheduled |
| `runtime = 'nodejs'` for transcript route | `youtube-transcript` requires Node.js internals, not edge-compatible |
| Dark mode by default | `class="dark"` always on `<html>` — no `prefers-color-scheme` |
| No database / auth / KV | Fully stateless V1 — transcripts fetched fresh per request |

---

## Adding New Design Tokens

This project uses **Tailwind v4** — there is no `tailwind.config.js`. All tokens live in `src/app/globals.css`:

```css
/* 1. Add to :root */
:root { --my-token: oklch(0.75 0.12 145.0); }

/* 2. Add to .dark */
.dark { --my-token: oklch(0.35 0.08 145.0); }

/* 3. Register in @theme inline */
@theme inline { --color-my-token: var(--my-token); }

/* 4. Use in components */
/* <div className="bg-my-token" /> */
```

Never hardcode colors inline. Always use CSS variables.
