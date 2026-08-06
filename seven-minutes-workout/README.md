# 7-Minuten Workout (PWA)

An installable Progressive Web App for the scientific **7-minute workout**:
12 bodyweight exercises, **30 s work / 10 s rest**, one circuit (~7 min), with an
animated countdown timer, audio cues, streak tracking, and **daily push
reminders that fire even when the app is closed**.

Served in production at **https://workout.zillessen.dev**.

Stack: React 19 + Vite + TypeScript + `vite-plugin-pwa` (custom service worker
via `injectManifest`). No backend for progress — it's stored locally (see
*Roadmap* for the planned email login + remote sync).

## Features

- **Timer engine** — countdown → 12× (work / rest) → summary, with pause,
  resume, skip and quit. Synthesised WebAudio beeps on each transition (no audio
  assets).
- **Progress (local)** — completed sessions, total count and current streak are
  persisted in `localStorage` (`workout:v1:progress`).
- **Male / female figure** — choose the figure in settings. Today it renders a
  simple gendered silhouette placeholder; the real per-exercise animations drop
  in later behind the same `<ExerciseFigure>` seam (`src/figures/`).
- **PWA** — installable, works offline, hourly update banner.
- **Push reminders** — a daily, time-of-day reminder delivered via real Web Push
  (works with the app fully closed). See *How reminders work*.

## The exercises

Jumping jacks · Wall sit · Push-ups · Crunches · Step-ups · Squats · Triceps dips
· Plank · High knees · Lunges · Push-up & rotation · Side plank.

## Develop

```bash
npm install            # at repo root (npm workspaces)
npm run dev:workout    # vite dev server → http://localhost:5174/seven-minutes-workout/
# or from this folder:
npm run dev
```

`config.js` (the VAPID public key) is generated at deploy time and is absent in
dev — the app runs fine, push reminders are simply disabled locally.

## Build

```bash
npm run build          # tsc -b && vite build → dist/
```

Production builds run via the repo-root `build.sh` (Cloudflare Pages/Worker),
which copies `dist/` into `_site/seven-minutes-workout/` and generates
`config.js` from the `WORKOUT_VAPID_PUBLIC_KEY` env var. Regenerate the PWA
icons (pure-Node PNG encoder, no native deps) with:

```bash
npm run gen-icons
```

## Tests

```bash
npm test               # Playwright e2e (chromium), starts the dev server itself
npm run test:ui        # Playwright UI mode
PW_WITH_WEBKIT=1 npm test   # also run WebKit
```

The suite (`tests/`) covers the happy paths: home + exercise list, settings
persistence (gender / sound), the timer (countdown ticking, pause/resume),
completing the circuit (session recorded, streak updated), quitting early, and
the PWA wiring (manifest, theme color, service-worker registration). It runs in
CI via `.github/workflows/e2e-workout.yml`.

## How reminders work

We use **payload-less Web Push** to keep the server simple:

1. The app asks for notification permission and subscribes via `PushManager`
   using the VAPID public key, then POSTs `{ endpoint, reminderTime, tz }` to
   `/api/workout/subscribe` (Cloudflare Worker → `WORKOUT_KV`).
2. A **Cron Trigger** (`*/15 * * * *`, in `wrangler.jsonc`) runs the Worker's
   `scheduled()` handler, which finds every subscription whose local reminder
   time falls in the current 15-minute window and sends an empty, VAPID-signed
   (ES256) push.
3. The service worker (`src/sw.ts`) renders a fixed reminder notification on the
   `push` event; tapping it focuses/opens the app.

Dead subscriptions (HTTP 404/410) are pruned automatically.

### Deploy setup (one-time)

```bash
npx web-push generate-vapid-keys          # → public + private (base64url)
npx wrangler kv namespace create WORKOUT_KV   # → id into wrangler.jsonc
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT      # e.g. mailto:you@zillessen.dev
# Cloudflare Pages env: set WORKOUT_VAPID_PUBLIC_KEY to the same public key.
```

Add the custom domain `workout.zillessen.dev` in the Cloudflare dashboard
(Workers & Pages → the `experiments` worker → Custom Domains). The Worker
rewrites that host onto `_site/seven-minutes-workout/`.

Verify push end-to-end after subscribing in the UI:

```bash
# Triggers an immediate reminder to an already-subscribed endpoint:
curl -X POST https://workout.zillessen.dev/api/workout/test \
  -H 'content-type: application/json' \
  -d '{"endpoint":"<your push endpoint>"}'
```

## Roadmap (deferred)

- **Email login + remote sync.** Progress is local-only today. The storage layer
  (`src/storage/progress.ts`) is an async-shaped `ProgressStore` so a remote
  backend (Supabase magic-link, like `kinderbetreuung-lohn`, or Worker/KV) can
  implement the same interface without UI changes.
- **Real male/female animations** per exercise, dropped into `ExerciseFigure`
  behind the existing gender setting.
