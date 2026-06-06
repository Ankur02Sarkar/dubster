# Dubster — Agent Instructions

> **CRITICAL:** Any AI agent working in this repository **MUST read this entire file before making any changes.** This file is the authoritative source of truth for architecture, conventions, constraints, and agent workflows.

*Last updated: 2026-06-07 — Initial generation*

---

Dubster is a stateless web application where users paste a YouTube URL and receive a real-time AI-dubbed audio track synchronized with the muted YouTube video. Transcript extraction is performed server-side via a Cloudflare Workers edge route; TTS synthesis (Kokoro ~92MB ONNX model) and audio scheduling run entirely in the browser. There is **no database, no auth, no KV store** in V1.

---

## Documentation Map

```
📁 dubster/
├── 📄 AGENTS.md                    ← You are here — read before touching anything
├── 📄 README.md                    ← User-facing project overview & quick-start
│
├── 📄 package.json                 ← Dependencies, scripts (dev/preview/deploy)
├── 📄 next.config.ts               ← Next.js config + OpenNext CF dev init
├── 📄 open-next.config.ts          ← OpenNext Cloudflare adapter config
├── 📄 wrangler.jsonc               ← CF Worker config (name, bindings, compat flags)
├── 📄 tsconfig.json                ← TypeScript (strict, moduleResolution: bundler)
├── 📄 components.json              ← shadcn config (style: base-maia, iconLibrary: hugeicons)
├── 📄 cloudflare-env.d.ts          ← Auto-generated CF runtime type bindings
├── 📄 eslint.config.mjs            ← ESLint (next/core-web-vitals + next/typescript)
│
└── 📁 src/
    ├── 📁 app/
    │   ├── 📄 globals.css          ← Tailwind v4 theme (ALL design tokens live here)
    │   ├── 📄 layout.tsx           ← Root layout (font loading, dark class)
    │   ├── 📄 page.tsx             ← Landing page — YouTube URL input form
    │   ├── 📁 watch/[videoId]/
    │   │   └── 📄 page.tsx         ← (PLANNED) Watch page — video + dubbed audio
    │   └── 📁 api/transcript/
    │       └── 📄 route.ts         ← (PLANNED) CF edge route: transcript proxy
    │
    ├── 📁 components/
    │   ├── 📁 ui/
    │   │   └── 📄 button.tsx       ← shadcn Button (base-ui primitive + CVA variants)
    │   ├── 📄 VideoPlayer.tsx      ← (PLANNED) YouTube IFrame + sync controller
    │   ├── 📄 TtsEngine.tsx        ← (PLANNED) Kokoro loader + audio generator
    │   ├── 📄 TranscriptPanel.tsx  ← (PLANNED) Segment display, active highlighting
    │   └── 📄 LoadingOverlay.tsx   ← (PLANNED) Model download progress UI
    │
    ├── 📁 lib/
    │   ├── 📄 utils.ts             ← cn() helper (clsx + tailwind-merge)
    │   ├── 📄 tts.ts               ← (PLANNED) Kokoro init + generate()
    │   ├── 📄 audio-scheduler.ts   ← (PLANNED) Web Audio API scheduling logic
    │   └── 📄 youtube.ts           ← (PLANNED) IFrame API wrapper + event helpers
    │
    └── 📁 hooks/
        ├── 📄 useYouTubePlayer.ts  ← (PLANNED) IFrame API state/events hook
        └── 📄 useTtsEngine.ts      ← (PLANNED) Kokoro loading + generation hook
```

> **Note:** Files marked `(PLANNED)` are architecture targets — they do not yet exist. Create them at these exact paths when implementing features.

---

## Domain Vocabulary

All agents must use these terms precisely and consistently across code, comments, and documentation.

| Term | Definition |
|------|------------|
| **Segment** | A single transcript entry: `{ text: string, offset: number, duration: number }`. `offset` and `duration` are in **milliseconds**. |
| **Dubbing** | The process of generating TTS audio for each segment and scheduling it to play in sync with the muted YouTube video. |
| **AudioContext** | The Web Audio API's timeline object. All audio scheduling uses `AudioContext.currentTime` (in seconds). |
| **Scheduled Source** | A `AudioBufferSourceNode` that has been `.start()`-ed at a future `AudioContext.currentTime`. Must be tracked and cancelled on seek. |
| **ONNX Model** | The Kokoro TTS model file (~92MB). Downloaded client-side, cached in browser storage (IndexedDB via the kokoro-js library). |
| **IFrame API** | The YouTube IFrame Player API loaded from `https://www.youtube.com/iframe_api`. Provides `YT.Player`. |
| **Drift Correction** | Polling `player.getCurrentTime()` every 100ms and re-scheduling audio sources when the delta between expected and actual video position exceeds a threshold. |
| **Edge Route** | A Next.js Route Handler running on Cloudflare Workers (edge runtime). Used for the transcript proxy. |
| **nodejs_compat** | The `compatibility_flag` in `wrangler.jsonc` that enables Node.js builtins in the CF Workers runtime. |
| **base-maia** | The shadcn component style variant used in this project (configured in `components.json`). |
| **OKLCH** | The color space used for all design tokens in `globals.css`. Always express colors as `oklch(L C H)`. |
| **CVA** | `class-variance-authority` — the library used to define component variant classes in shadcn components. |
| **RSC** | React Server Component — any component that does NOT have `'use client'`. Cannot use browser APIs or React hooks. |

---

## Architecture Overview

### System Data Flow

```mermaid
graph TD
    A[User pastes YouTube URL] --> B[Landing Page - page.tsx]
    B -->|Extract videoId| C[Navigate to /watch/videoId]
    C --> D[Watch Page - RSC]

    D -->|Server fetch| E[/api/transcript route.ts]
    E -->|youtube-transcript npm| F[YouTube Transcript API]
    F -->|TranscriptSegment array| E
    E -->|JSON response| D

    D --> G[VideoPlayer.tsx - Client Component]
    D --> H[TtsEngine.tsx - Client Component]

    G -->|Load IFrame API| I[YouTube IFrame Player]
    I -->|onReady: mute + play| G
    G -->|getCurrentTime poll 100ms| J[Drift Correction Loop]

    H -->|First render| K{ONNX Model Cached?}
    K -->|No| L[Download ~92MB model]
    L -->|Cache in IndexedDB| M[Kokoro TTS Ready]
    K -->|Yes| M

    M -->|segments array| N[Generate audio per segment]
    N -->|AudioBuffer| O[audio-scheduler.ts]
    O -->|scheduleSource at offset/1000s| P[AudioBufferSourceNode.start]

    J -->|Seek detected| Q[Cancel all scheduled sources]
    Q -->|Re-schedule from new position| O
```

### Component Responsibility Matrix

| Component/File | Runtime | Key Responsibility |
|---|---|---|
| `app/page.tsx` | RSC | URL input form, videoId extraction, redirect |
| `app/watch/[videoId]/page.tsx` | RSC (initial) | Fetch transcript, pass to client components |
| `app/api/transcript/route.ts` | CF Edge Worker | Proxy transcript fetch, return JSON |
| `components/VideoPlayer.tsx` | Client | IFrame lifecycle, mute, time polling, seek events |
| `components/TtsEngine.tsx` | Client | Kokoro model lifecycle, segment audio generation |
| `components/TranscriptPanel.tsx` | Client | Display segments, highlight active segment |
| `components/LoadingOverlay.tsx` | Client | Model download progress (0–100%) |
| `lib/tts.ts` | Client (browser) | Kokoro `KokoroTTS` init + `generate()` wrapper |
| `lib/audio-scheduler.ts` | Client (browser) | `AudioContext` scheduling, seek/cancel logic |
| `lib/youtube.ts` | Client (browser) | IFrame API loader, `YT.Player` wrapper |
| `hooks/useYouTubePlayer.ts` | Client | React state for player readiness, current time |
| `hooks/useTtsEngine.ts` | Client | React state for model load progress, generation |

### Critical Architectural Decisions

| Decision | Rationale |
|---|---|
| Client-side TTS (Kokoro) | Avoids server-side audio generation costs; ONNX runs in browser via WebGPU/WASM |
| Server-side transcript proxy | YouTube transcript fetching requires Node.js HTTP; not available as a direct browser call |
| Gap-based audio scheduling | Simpler than speed-stretching; each segment is independent; seeks are handled by cancel+reschedule |
| No database in V1 | Purely stateless; transcripts fetched fresh per request; no persistence needed |
| Cloudflare Workers runtime | Edge deployment, global low-latency; `nodejs_compat` flag enables Node.js builtins |
| `export const runtime = 'nodejs'` for transcript route | `youtube-transcript` npm package uses Node.js APIs incompatible with the edge runtime |

---

## Agent Responsibilities

### Before Making Changes

Every agent session MUST complete these steps in order:

1. **Re-read this file** (`AGENTS.md`) completely.
2. **Identify the component being modified** from the table above.
3. **Check the runtime context** — is this RSC or Client? If Client, confirm `'use client'` directive.
4. **Check CF Workers constraints** (see section below) if touching any route handler.
5. **Read the relevant source files** before editing. Never edit a file you haven't read.
6. **Check `globals.css`** before adding any color, spacing, or typography values.

### After Making Changes

After completing any implementation task, the agent MUST:

| Change Type | Files to Update |
|---|---|
| New page or route | This `AGENTS.md` Documentation Map; `README.md` if user-facing |
| New component created | This `AGENTS.md` Documentation Map + Component Responsibility Matrix |
| New lib utility | This `AGENTS.md` Documentation Map |
| New hook created | This `AGENTS.md` Documentation Map |
| New CSS variable / design token | `globals.css` `:root` AND `.dark` blocks (never just one) |
| New shadcn component installed | `AGENTS.md` — note it in the components/ui directory listing |
| New npm dependency | `AGENTS.md` — note it in the tech stack section of `README.md` |
| Route handler runtime changed | `AGENTS.md` Architecture Decision table |
| Any `wrangler.jsonc` change | Run `npm run cf-typegen` to regenerate `cloudflare-env.d.ts` |
| Transcript API change | Update segment type definition in all consumers |

---

## Agent Playbooks

### 1. General Coding Agent

**File placement rules:**

- **Pages** → `src/app/**` (RSC by default; add `'use client'` only if strictly needed)
- **Route Handlers** → `src/app/api/**/route.ts` (follow Next.js App Router conventions)
- **Reusable UI components** → `src/components/*.tsx` (Client Components if they use hooks/browser APIs)
- **shadcn primitives** → `src/components/ui/*.tsx` (installed via `npx shadcn add <name>`, never hand-written)
- **Business logic / utilities** → `src/lib/*.ts` (pure functions, no React)
- **React state/effects** → `src/hooks/use*.ts` (one hook per concern; prefix `use`)

**Naming conventions:**

```
PascalCase     → React components, TypeScript interfaces, type aliases
camelCase      → functions, variables, hook names (useXxx), file-level constants
kebab-case     → file names for pages (Next.js convention), CSS class names
SCREAMING_SNAKE → true constants (e.g., POLL_INTERVAL_MS = 100)
```

**TypeScript rules:**

- `strict: true` is non-negotiable — no `any`, no `// @ts-ignore` without a documented reason
- `moduleResolution: bundler` — use bare specifiers for imports, never `.js` extensions in source
- Always use `import type` for type-only imports
- Use `@/*` path alias (maps to `src/*`) — never use relative `../../` paths that cross `src/` subdirectories

**Commenting policy:**

- Comment the **why**, never the **what**
- Do NOT add comments like `// increment counter` above `counter++`
- DO add comments for: Web Audio timing math, IFrame API quirks, CF Workers limitations encountered
- JSDoc only on exported functions in `lib/` — keep components self-documenting via props types

**Adding new features checklist:**

```
[ ] Correct directory for the file type
[ ] Correct runtime (RSC vs Client)
[ ] TypeScript strict — no implicit any
[ ] Uses cn() for all className construction
[ ] Uses Hugeicons for any icons (never Lucide, never emoji as UI)
[ ] Uses shadcn primitives where available
[ ] Dark mode tested (html.dark class is always present)
[ ] No hardcoded colors — CSS variables only
```

---

### 2. Cloudflare Workers (CF Workers) Agent

> **Warning:** The Cloudflare Workers runtime is NOT a full Node.js environment. Violating these constraints will cause silent failures or 500 errors in production that do not appear during `npm run dev`.

#### Runtime Reference

| Feature | Available in CF Workers? | Notes |
|---|---|---|
| `fetch` | ✅ Yes | Native, same as browser |
| `crypto` | ✅ Yes | Web Crypto API |
| `setTimeout` / `setInterval` | ✅ Yes | Limited to request lifecycle |
| `TextEncoder` / `TextDecoder` | ✅ Yes | |
| `ReadableStream` / `TransformStream` | ✅ Yes | |
| `WebSocket` | ✅ Yes | Server-side WS |
| `Node.js fs`, `path`, `os` | ✅ Yes (with `nodejs_compat`) | Enabled in `wrangler.jsonc` |
| `Node.js http`, `https` | ⚠️ Partial | Use native `fetch` instead when possible |
| `AudioContext`, `AudioBuffer` | ❌ Never | Browser-only; must be in Client Components |
| `window`, `document` | ❌ Never | Browser-only |
| `process.env` | ⚠️ Limited | Only vars declared in `wrangler.jsonc` vars block or secrets |
| Durable Objects | ❌ Not configured in V1 | |
| KV / R2 / D1 | ❌ Not configured in V1 | |

#### Transcript Route Handler Rules

**File:** `src/app/api/transcript/route.ts`

```typescript
// ALWAYS use nodejs runtime for this route — youtube-transcript uses Node.js internals
export const runtime = 'nodejs';

// NEVER use 'edge' runtime for this route — it will fail in production
// export const runtime = 'edge'; // ❌ DO NOT DO THIS
```

**Pattern for the transcript route:**

```typescript
import { YoutubeTranscript } from 'youtube-transcript';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get('videoId');
  if (!videoId) {
    return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
  }
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    return NextResponse.json(transcript);
  } catch (err) {
    return NextResponse.json({ error: 'Transcript unavailable' }, { status: 404 });
  }
}
```

**CORS:** The transcript API is called from the same origin — no CORS headers needed for V1.

#### Accessing CF Bindings in Route Handlers

```typescript
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET() {
  const { env } = await getCloudflareContext();
  // env.ASSETS, env.IMAGES, env.WORKER_SELF_REFERENCE are available
  // env.MY_KV, env.MY_R2 — NOT available until added to wrangler.jsonc
}
```

#### When Adding New Bindings

1. Add the binding to `wrangler.jsonc`
2. Run `npm run cf-typegen` — this regenerates `cloudflare-env.d.ts`
3. Never manually edit `cloudflare-env.d.ts` — it is auto-generated

#### Testing CF-Specific Code

- `npm run dev` — Next.js dev server (NOT the CF runtime; Node.js polyfills apply)
- `npm run preview` — Builds and runs in the actual CF Workers runtime locally via Wrangler
- **Always run `npm run preview` before deploying** when editing route handlers

---

### 3. Styling Agent

> **Critical Rule:** There is **no `tailwind.config.js`** in this project. All design tokens are declared in `src/app/globals.css`. Never create a `tailwind.config.js`.

#### Adding Colors or Design Tokens

**Step 1:** Add the CSS variable to `:root` in `globals.css`:
```css
:root {
  --my-new-color: oklch(0.75 0.12 145.0);
}
```

**Step 2:** Add the corresponding dark mode value in `.dark` in `globals.css`:
```css
.dark {
  --my-new-color: oklch(0.35 0.08 145.0);
}
```

**Step 3:** Register it as a Tailwind token in `@theme inline {}`:
```css
@theme inline {
  --color-my-new-color: var(--my-new-color);
}
```

**Step 4:** Use it in components:
```tsx
<div className="bg-my-new-color text-foreground" />
```

> **Warning:** NEVER hardcode color values in JSX or CSS. Always use CSS variables. NEVER use `#hex` or `rgb()` values inline — convert to OKLCH and declare in `globals.css`.

#### Existing Design Tokens Reference

| Token | Light Value | Dark Value | Usage |
|---|---|---|---|
| `--primary` | `oklch(0.7357 0.1641 34.7091)` | Same | Warm orange — CTAs, interactive elements |
| `--background` | `oklch(0.9856 0.0084 56.3169)` | `oklch(0.2569 0.0169 352.4042)` | Page background |
| `--foreground` | `oklch(0.3353 0.0132 2.7676)` | `oklch(0.9397 0.0119 51.3156)` | Body text |
| `--card` | `oklch(1.0000 0 0)` | `oklch(0.3184 0.0176 341.4465)` | Card/panel surfaces |
| `--accent` | `oklch(0.8278 0.1131 57.9984)` | Same | Secondary highlights |
| `--muted` | `oklch(0.9656 0.0176 39.4009)` | `oklch(0.2848 0.0159 343.6554)` | Subtle backgrounds |
| `--border` | `oklch(0.9296 0.0370 38.6868)` | `oklch(0.3637 0.0203 342.2664)` | Borders, dividers |
| `--destructive` | `oklch(0.6122 0.2082 22.2410)` | Same | Error states |
| `--radius` | `0.625rem` | Same | Base border radius |

#### Typography

| Variable | Font | Use case |
|---|---|---|
| `--font-sans` | Figtree (loaded) / Montserrat (CSS fallback) | Body text, UI labels |
| `--font-serif` | Merriweather | Long-form content, pull quotes |
| `--font-mono` | Ubuntu Mono | Code, timestamps |

> **Known Issue:** `layout.tsx` currently loads `Figtree` as `--font-sans` but `globals.css` declares `--font-sans: Montserrat, sans-serif`. The loaded font (Figtree) takes precedence via the `variable` prop. **Do not change `globals.css` to Figtree** — the CSS fallback is intentional for SSR. The correct fix is to ensure `layout.tsx` loads Figtree only (remove `Geist` and `Geist_Mono` — these are unused and add unnecessary bundle weight).

#### Dark Mode

```
RULE: The <html> element ALWAYS has class="dark". Dark mode is the default and only theme.
```

- Use `dark:` Tailwind variant prefix for any style that differs in dark vs light
- Dark styles are triggered by the `.dark` class (see `@custom-variant dark (&:is(.dark *))` in globals.css)
- **Never** use `@media (prefers-color-scheme: dark)` — this project uses class-based dark mode

#### Tailwind v4 Class Usage

```tsx
// ✅ Correct — use CSS variable tokens
<div className="bg-background text-foreground border-border rounded-lg p-4" />

// ✅ Correct — use semantic color names
<button className="bg-primary text-primary-foreground hover:bg-primary/80" />

// ✅ Correct — dark variant with class-based dark mode
<div className="bg-white dark:bg-card" />

// ❌ Wrong — hardcoded colors
<div className="bg-[#1a1a1a]" />

// ❌ Wrong — Tailwind v3 config-based colors that don't exist in this project
<div className="bg-orange-500" />
```

#### Installing shadcn Components

```bash
# Always use the CLI — never copy-paste shadcn components manually
npx shadcn add <component-name>

# Examples
npx shadcn add input
npx shadcn add card
npx shadcn add progress
npx shadcn add dialog
```

Components are installed to `src/components/ui/`. They use `@base-ui/react` primitives and Hugeicons.

#### Using Hugeicons

```tsx
// Import icons from the free pack
import { Play01Icon, Pause01Icon, LoadingIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

// Usage
<HugeiconsIcon icon={Play01Icon} size={20} className="text-primary" />

// NEVER use Lucide, Heroicons, or emoji as UI elements
```

---

### 4. TTS / Audio Agent

> **Critical:** All Kokoro TTS and Web Audio API code runs exclusively in the browser. Never import `kokoro-js` or use `AudioContext` in RSC, server components, or route handlers.

#### Kokoro TTS Setup Pattern

**File:** `src/lib/tts.ts`

```typescript
'use client'; // Not needed in lib files, but the CONSUMER must be a Client Component

import { KokoroTTS } from 'kokoro-js';

let ttsInstance: KokoroTTS | null = null;

export async function initTTS(
  onProgress?: (progress: number) => void
): Promise<KokoroTTS> {
  if (ttsInstance) return ttsInstance;

  // Use q8 quantization for balance of quality and size
  // WebGPU is preferred; kokoro-js falls back to WASM automatically
  ttsInstance = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8',
    device: 'webgpu', // Falls back to 'wasm' automatically
    progress_callback: (progress: { progress: number }) => {
      onProgress?.(Math.round(progress.progress));
    },
  });

  return ttsInstance;
}

export async function generateSegmentAudio(
  tts: KokoroTTS,
  text: string
): Promise<AudioBuffer> {
  const audio = await tts.generate(text, { voice: 'af_heart' });
  // audio.audio is a Float32Array of PCM samples
  // audio.sampling_rate is the sample rate (typically 24000 Hz)
  const audioCtx = getAudioContext();
  const buffer = audioCtx.createBuffer(1, audio.audio.length, audio.sampling_rate);
  buffer.copyToChannel(audio.audio, 0);
  return buffer;
}
```

**File:** `src/hooks/useTtsEngine.ts` — must have `'use client'` directive:

```typescript
'use client';

import { useState, useCallback } from 'react';
import { initTTS, generateSegmentAudio } from '@/lib/tts';
import type { KokoroTTS } from 'kokoro-js';

export function useTtsEngine() {
  const [tts, setTts] = useState<KokoroTTS | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const instance = await initTTS(setLoadProgress);
      setTts(instance);
      setIsReady(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { tts, loadProgress, isLoading, isReady, error, load };
}
```

#### Audio Scheduling Architecture

**File:** `src/lib/audio-scheduler.ts`

The scheduler maintains a list of `AudioBufferSourceNode` references so they can be cancelled on seek.

```typescript
// Segment type (matches youtube-transcript output)
export interface TranscriptSegment {
  text: string;
  offset: number;   // milliseconds from video start
  duration: number; // milliseconds
}

// Internal tracking
interface ScheduledAudio {
  source: AudioBufferSourceNode;
  segmentIndex: number;
}

class AudioScheduler {
  private ctx: AudioContext;
  private scheduled: ScheduledAudio[] = [];

  constructor() {
    this.ctx = new AudioContext();
  }

  // Call when the video starts or resumes
  scheduleFrom(
    segments: TranscriptSegment[],
    buffers: (AudioBuffer | null)[],
    videoCurrentTimeSeconds: number
  ) {
    const now = this.ctx.currentTime;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const buf = buffers[i];
      if (!buf) continue;

      const segStartSeconds = seg.offset / 1000;
      const delay = segStartSeconds - videoCurrentTimeSeconds;

      // Skip segments already in the past
      if (delay < -0.1) continue;

      const source = this.ctx.createBufferSource();
      source.buffer = buf;
      source.connect(this.ctx.destination);
      source.start(now + Math.max(0, delay));

      this.scheduled.push({ source, segmentIndex: i });
    }
  }

  // Call on any seek event
  cancelAll() {
    for (const { source } of this.scheduled) {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
    }
    this.scheduled = [];
  }

  get audioContext() { return this.ctx; }
}

// Singleton — one AudioContext per page (browser limit)
let scheduler: AudioScheduler | null = null;
export function getAudioScheduler(): AudioScheduler {
  if (!scheduler) scheduler = new AudioScheduler();
  return scheduler;
}
```

#### Key Audio Rules

1. **One `AudioContext` per page** — create once, reuse. Multiple contexts will be garbage collected or throttled by browsers.
2. **`AudioContext` must be created in response to a user gesture** — instantiate lazily on first user interaction, not on component mount.
3. **Drift correction** — poll `player.getCurrentTime()` every `POLL_INTERVAL_MS = 100` ms. If drift exceeds `DRIFT_THRESHOLD_S = 0.3` seconds, call `cancelAll()` and `scheduleFrom()` from the new position.
4. **Segment independence** — each segment's audio is generated and scheduled independently. Do NOT concatenate audio buffers across segments.
5. **Pre-generate strategy** — start generating audio for all segments as soon as the model is ready, before the user presses play. Store `AudioBuffer | null` in an array indexed by segment position.

#### Kokoro-Specific Gotchas

- `kokoro-js` is an ESM-only package. If Next.js bundling fails, add it to `experimental.serverComponentsExternalPackages` in `next.config.ts` — but only if accidentally imported server-side.
- WebGPU is not available in all browsers. The `device: 'webgpu'` option automatically falls back to WASM — do NOT add a manual fallback; let the library handle it.
- The model is cached in IndexedDB by `transformers.js` (which kokoro-js uses under the hood) — the 92MB download only happens once per browser.
- `dtype: 'q8'` is the correct quantization for a good quality/size tradeoff. Do NOT use `fp32` (too slow) or `q4` (quality too low).

---

### 5. YouTube Integration Agent

#### IFrame API Loading

**File:** `src/lib/youtube.ts`

```typescript
// Type the IFrame API
// Run: npm install --save-dev @types/youtube
// This makes YT, YT.Player, YT.PlayerState etc. available globally

export function loadYouTubeIFrameAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }

    // The API calls this global when ready
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      resolve();
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
}

export function createPlayer(
  elementId: string,
  videoId: string,
  events: YT.Events
): YT.Player {
  return new window.YT.Player(elementId, {
    videoId,
    playerVars: {
      autoplay: 0,
      controls: 1,
      mute: 1,         // Always start muted — Kokoro audio is the audio track
      rel: 0,
      modestbranding: 1,
    },
    events,
  });
}
```

**File:** `src/hooks/useYouTubePlayer.ts`

```typescript
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { loadYouTubeIFrameAPI, createPlayer } from '@/lib/youtube';

export const POLL_INTERVAL_MS = 100;

export function useYouTubePlayer(videoId: string) {
  const playerRef = useRef<YT.Player | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [playerState, setPlayerState] = useState<YT.PlayerState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    let mounted = true;
    loadYouTubeIFrameAPI().then(() => {
      if (!mounted) return;
      playerRef.current = createPlayer('yt-player', videoId, {
        onReady: () => {
          playerRef.current?.mute();
          setIsReady(true);
        },
        onStateChange: (event) => {
          setPlayerState(event.data);
        },
      });
    });

    return () => {
      mounted = false;
      if (pollRef.current) clearInterval(pollRef.current);
      playerRef.current?.destroy();
    };
  }, [videoId]);

  // Poll for current time
  useEffect(() => {
    if (!isReady) return;
    pollRef.current = setInterval(() => {
      const t = playerRef.current?.getCurrentTime() ?? 0;
      setCurrentTime(t);
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isReady]);

  const seek = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
  }, []);

  return { isReady, playerState, currentTime, playerRef, seek };
}
```

#### IFrame API Rules

1. **Never access `window.YT` directly in RSC** — the IFrame API is browser-only. All player code goes in Client Components or hooks.
2. **Mute on `onReady`** — the YouTube video must be muted immediately. Kokoro audio is the active audio track.
3. **Use `@types/youtube`** for full TypeScript type coverage of `YT.Player`, `YT.PlayerState`, `YT.Events`.
4. **`controls: 1`** in playerVars — keep YouTube native controls for standard UX (play, pause, seek bar).
5. **Seek handling** — when `onStateChange` fires with `YT.PlayerState.PAUSED` or when `currentTime` jumps unexpectedly, call `cancelAll()` on the `AudioScheduler` and reschedule from the new position.
6. **`div` id requirement** — the container `<div id="yt-player" />` must exist in the DOM before calling `createPlayer()`. Use `useEffect` to defer creation until after mount.

#### Transcript API — CORS & Proxy

The `youtube-transcript` package fetches from YouTube's servers. To avoid CORS issues:
- **Always** fetch via the internal route `/api/transcript?videoId=<id>` from the client
- **Never** call `youtube-transcript` from a Client Component directly
- The server-side proxy route (`src/app/api/transcript/route.ts`) uses `export const runtime = 'nodejs'`

```typescript
// In a Client Component or hook — fetch via the proxy
const response = await fetch(`/api/transcript?videoId=${videoId}`);
if (!response.ok) throw new Error('Transcript unavailable');
const segments: TranscriptSegment[] = await response.json();
```

---

## Quick Reference

### Important Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server (Node.js runtime, not CF Workers) |
| `npm run preview` | Build + run in actual CF Workers runtime via Wrangler |
| `npm run deploy` | Build + deploy to Cloudflare production |
| `npm run lint` | ESLint (next/core-web-vitals + next/typescript) |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` from `wrangler.jsonc` |
| `npx shadcn add <name>` | Install a shadcn component |

### Key File Paths

| Path | Purpose |
|---|---|
| `src/app/globals.css` | **All** design tokens, dark mode vars, Tailwind v4 theme |
| `src/app/layout.tsx` | Root layout — font loading, `class="dark"` on `<html>` |
| `src/lib/utils.ts` | `cn()` helper — use this for all `className` merging |
| `src/components/ui/button.tsx` | Reference implementation for shadcn + base-ui pattern |
| `wrangler.jsonc` | CF Worker name, bindings, compat flags |
| `cloudflare-env.d.ts` | Auto-generated CF env types — do not hand-edit |
| `components.json` | shadcn config — style, aliases, icon library |
| `open-next.config.ts` | OpenNext adapter config (R2 cache, etc.) |

### Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `next` | 16.2.6 | Framework |
| `react` / `react-dom` | ^19.1.7 | UI runtime |
| `@opennextjs/cloudflare` | ^1.19.9 | CF Workers adapter |
| `tailwindcss` | ^4 | Styling (v4 — CSS-only config) |
| `@base-ui/react` | ^1.5.0 | Headless UI primitives (shadcn base) |
| `@hugeicons/react` + `@hugeicons/core-free-icons` | latest | Icon library |
| `class-variance-authority` | ^0.7.1 | CVA for component variants |
| `clsx` + `tailwind-merge` | latest | Class merging via `cn()` |
| `tw-animate-css` | ^1.4.0 | Animation utilities |
| `kokoro-js` | TBD | Client-side TTS (install when implementing TTS) |
| `youtube-transcript` | TBD | Server-side transcript fetching (install when implementing transcript route) |
| `@types/youtube` | TBD | IFrame API types (devDependency) |
| `wrangler` | ^4.98.0 | CF Workers CLI |

> **Note:** `kokoro-js`, `youtube-transcript`, and `@types/youtube` are not yet installed. Add them when implementing those features.

### CF Workers Bindings (Current V1)

| Binding | Type | Purpose |
|---|---|---|
| `ASSETS` | `Fetcher` | Static asset serving |
| `IMAGES` | `ImagesBinding` | CF image optimization |
| `WORKER_SELF_REFERENCE` | `Fetcher` | Self-referencing service binding for caching |
| `NEXTJS_ENV` | `string` | Next.js environment string |

---

## Testing Checklist

Before submitting any change, verify the following:

### General

```
[ ] TypeScript compiles without errors (implicit in build)
[ ] ESLint passes: npm run lint
[ ] No hardcoded colors in JSX or CSS
[ ] All new components have proper TypeScript prop types (no implicit any)
[ ] cn() used for all className construction (not string concatenation)
```

### Styling

```
[ ] New CSS variables added to BOTH :root AND .dark blocks in globals.css
[ ] New Tailwind tokens registered in @theme inline {} in globals.css
[ ] Dark mode renders correctly (html element always has class="dark")
[ ] No tailwind.config.js was created
```

### Client Components

```
[ ] 'use client' directive present at top of file
[ ] No server-only APIs used (no fs, no Node.js http, no process.env for secrets)
[ ] AudioContext created lazily (on user gesture, not on mount)
[ ] KokoroTTS not imported in any RSC or route handler
```

### CF Workers / Route Handlers

```
[ ] Transcript route uses export const runtime = 'nodejs'
[ ] No AudioContext or browser APIs in route handlers
[ ] npm run preview tested (not just npm run dev)
[ ] New bindings added to wrangler.jsonc AND npm run cf-typegen run
```

### YouTube Integration

```
[ ] IFrame API loaded in useEffect (not at module level)
[ ] Player muted on onReady
[ ] Player destroyed in useEffect cleanup
[ ] Transcript fetched via /api/transcript proxy (not directly from client)
```

---

## Self-Update Clause

This `AGENTS.md` file is the **authoritative source** for agent behavior in this project. It **MUST** be updated by any agent that:

1. **Creates new files** not listed in the Documentation Map above
2. **Installs new npm packages** not in the Key Dependencies table
3. **Adds new CF Worker bindings** not in the Bindings table
4. **Changes the runtime** of any route handler
5. **Discovers a new constraint** not documented (e.g., a new CF Workers API limitation)
6. **Implements a planned component** (updates status from `(PLANNED)` to active)
7. **Introduces new domain vocabulary** not in the Domain Vocabulary table

### Update Protocol

When any of the above occurs, the agent MUST:

1. Update the **Documentation Map** to include any new files
2. Update the **Component Responsibility Matrix** if a new component was added
3. Update the **Key Dependencies** table if new packages were installed
4. Update the **CF Workers Bindings** table if `wrangler.jsonc` was changed
5. Add new terms to the **Domain Vocabulary** table
6. Update `(PLANNED)` markers to reflect implementation status
7. Update the `*Last updated*` header at the top of this file with the date and reason

### Header Update Format

```
*Last updated: YYYY-MM-DD — [Brief reason: e.g., "Implemented TTS engine and audio scheduler"]*
```
