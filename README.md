# Dubster

> Paste a YouTube URL. Get real-time AI-dubbed audio, perfectly synced with the video.

Dubster extracts a video's transcript server-side, downloads a lightweight Kokoro TTS model (~92MB, cached in your browser after the first run), generates English dubbed audio segment-by-segment, and plays it back in sync with the muted YouTube embed — no server-side audio generation, no database, no login required.

---

## How It Works

```
YouTube URL
    │
    ▼
Server (Cloudflare Workers)
    ├── Extracts video ID
    └── Fetches transcript via youtube-transcript
            │
            ▼
Browser (Client)
    ├── Loads Kokoro ONNX model (~92MB, WebGPU → WASM fallback)
    ├── Generates AudioBuffer for each transcript segment
    ├── Schedules audio via Web Audio API (gap-based, no speed-stretch)
    └── Plays synced dubbed audio over muted YouTube IFrame embed
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, RSC) |
| Deployment | Cloudflare Workers via `@opennextjs/cloudflare` |
| UI runtime | React 19, TypeScript 5.7 (strict) |
| Styling | Tailwind v4 (CSS-only config), shadcn `base-maia` style |
| UI primitives | `@base-ui/react` headless components |
| Icons | Hugeicons (`@hugeicons/react`) |
| TTS engine | `kokoro-js` — Kokoro 82M ONNX, `q8` quantized |
| Transcript | `youtube-transcript` (server-side proxy route) |
| YouTube embed | YouTube IFrame Player API (`@types/youtube`) |
| Audio | Web Audio API — `AudioContext` + `AudioBufferSourceNode` |
| Fonts | Figtree (body), Merriweather (serif), Ubuntu Mono (mono) |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- A Cloudflare account (for `preview` and `deploy`)

### Install

```bash
git clone <repo-url>
cd dubster
npm install
```

### Develop

Runs a standard Next.js dev server with Node.js polyfills. Fast iteration, hot reload.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** The dev server runs in the Node.js runtime, not the Cloudflare Workers runtime. Some CF-specific behavior (e.g. `global_fetch_strictly_public`) will differ. Always validate route handlers with `npm run preview` before shipping.

### Preview (Cloudflare Runtime)

Builds the app and runs it locally inside the actual Wrangler/workerd runtime. Use this to catch CF Workers-specific issues before deploying.

```bash
npm run preview
```

### Deploy

```bash
npm run deploy
```

This runs `opennextjs-cloudflare build && opennextjs-cloudflare deploy` and publishes to your configured Cloudflare Workers project (`dubster`).

### Lint

```bash
npm run lint
```

Uses ESLint with `next/core-web-vitals` and `next/typescript` rules.

---

## Project Structure

```
dubster/
├── src/
│   ├── app/
│   │   ├── globals.css              # Tailwind v4 theme — ALL design tokens live here
│   │   ├── layout.tsx               # Root layout (Figtree font, dark mode class)
│   │   ├── page.tsx                 # Landing page — YouTube URL input
│   │   ├── watch/[videoId]/
│   │   │   └── page.tsx             # Watch page — video + dubbed audio player
│   │   └── api/transcript/
│   │       └── route.ts             # Server route — transcript proxy (nodejs runtime)
│   │
│   ├── components/
│   │   ├── ui/                      # shadcn components (button, input, etc.)
│   │   ├── VideoPlayer.tsx          # YouTube IFrame embed + sync controller
│   │   ├── TtsEngine.tsx            # Kokoro model loader + audio generator
│   │   ├── TranscriptPanel.tsx      # Scrollable transcript, active segment highlight
│   │   └── LoadingOverlay.tsx       # Model download progress bar (0–100%)
│   │
│   ├── lib/
│   │   ├── utils.ts                 # cn() — class merging helper (clsx + tailwind-merge)
│   │   ├── tts.ts                   # Kokoro init + segment audio generation
│   │   ├── audio-scheduler.ts       # Web Audio API scheduling + seek/cancel logic
│   │   └── youtube.ts               # IFrame API loader + YT.Player factory
│   │
│   └── hooks/
│       ├── useYouTubePlayer.ts      # Player state, time polling, seek
│       └── useTtsEngine.ts          # Model loading progress, audio generation state
│
├── wrangler.jsonc                   # Cloudflare Worker config
├── open-next.config.ts              # OpenNext adapter settings
├── next.config.ts                   # Next.js config
├── components.json                  # shadcn config (base-maia, hugeicons)
└── AGENTS.md                        # AI agent instructions — read before contributing
```

---

## Design System

Dubster uses a **dark-first** design. The `<html>` element always has `class="dark"`. There is intentionally no light/dark toggle in V1.

### Colors (OKLCH)

All colors are declared as CSS custom properties in `src/app/globals.css`. There is **no `tailwind.config.js`** — Tailwind v4 reads tokens directly from the CSS.

| Token | Dark mode value | Visual |
|---|---|---|
| `--primary` | `oklch(0.7357 0.1641 34.7091)` | Warm orange — buttons, links |
| `--background` | `oklch(0.2569 0.0169 352.4042)` | Deep wine/rose — page bg |
| `--card` | `oklch(0.3184 0.0176 341.4465)` | Slightly lighter surface |
| `--accent` | `oklch(0.8278 0.1131 57.9984)` | Amber — secondary highlights |
| `--foreground` | `oklch(0.9397 0.0119 51.3156)` | Off-white text |

### Icons

All icons come from Hugeicons. Never use Lucide, Heroicons, or emoji as interface elements.

```tsx
import { Play01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

<HugeiconsIcon icon={Play01Icon} size={20} className="text-primary" />
```

---

## Architecture Notes

### Why client-side TTS?

Running Kokoro in the browser (via WebGPU or WASM) eliminates server-side audio generation costs. The ~92MB model is downloaded once and cached permanently in the browser's IndexedDB — subsequent visits are instant.

### Why a server-side transcript proxy?

The `youtube-transcript` npm package uses Node.js HTTP internals that are unavailable in the browser. The `/api/transcript` route runs on Cloudflare Workers with the `nodejs_compat` flag, proxying the request and returning clean JSON.

### Why gap-based audio scheduling?

Each transcript segment is an independent `AudioBufferSourceNode` scheduled at `offset / 1000` seconds on the `AudioContext` timeline. This is simpler and more reliable than trying to speed-stretch a continuous audio stream to match the video. When the user seeks, all scheduled sources are cancelled and rescheduled from the new position.

### No database, no auth

V1 is entirely stateless. Transcripts are fetched fresh on every watch page load. There is no user persistence, no saved history, no accounts.

---

## Contributing

Before making changes, read `AGENTS.md` — it contains the full architecture, coding conventions, component patterns, and CF Workers constraints that every contributor (human or AI) must follow.

### Key rules at a glance

1. **No `tailwind.config.js`** — all tokens go in `globals.css`
2. **No hardcoded colors** — use CSS variables (`bg-primary`, not `bg-[#ff6633]`)
3. **No `AudioContext` in server code** — browser-only, Client Components only
4. **Always `npm run preview`** before deploying route handler changes
5. **Use `cn()` for all className merging** — never string concatenation
6. **Hugeicons only** — never add other icon libraries

---

## Roadmap

- [ ] Landing page — YouTube URL input + validation
- [ ] Watch page — muted IFrame + synchronized dubbed audio
- [ ] `/api/transcript` — server-side transcript proxy
- [ ] `useTtsEngine` — Kokoro model loading with progress
- [ ] `useYouTubePlayer` — IFrame lifecycle, time polling, seek
- [ ] `audio-scheduler` — gap-based AudioContext scheduling
- [ ] `LoadingOverlay` — model download progress UI
- [ ] `TranscriptPanel` — scrollable transcript with active highlight
- [ ] Drift correction — detect seek and reschedule audio sources
- [ ] Voice selection UI (Kokoro supports multiple voices)
- [ ] Shareable watch URLs

---

## License

MIT
