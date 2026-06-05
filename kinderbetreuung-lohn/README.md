# Lohnabrechnung Kinderbetreuung

Vereinfachte Lohnabrechnung (VAV/VAVplus, Kanton Zürich) für Kinderbetreuung im Privathaushalt. React + Vite + TypeScript frontend, Supabase backend (Postgres, Auth via Magic Link, RLS).

## Setup

```bash
npm install            # at repo root (npm workspaces)
cp config.example.js config.js   # fill in Supabase URL + publishable key
```

## Development

```bash
npm run dev            # vite dev server on :8080 (needs config.js in public/ or project root served path)
npm run supabase:start # local Supabase stack (requires Docker)
```

## Build

```bash
npm run build          # tsc -b && vite build → dist/
```

Production builds happen via the repo-root `build.sh` (Cloudflare Pages), which runs the Vite build and generates `config.js` from `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` env vars.

## Tests

```bash
npm test               # Playwright e2e (starts/reset local Supabase, builds site, serves on :8080)
npm run test:ui        # Playwright UI mode
```

`tests/e2e/visual.spec.ts` contains visual regression tests. Baselines (in `visual.spec.ts-snapshots/`) were captured on macOS/Chromium and are platform-tied; regenerate with `npx playwright test visual --update-snapshots` when intentionally changing the UI.
