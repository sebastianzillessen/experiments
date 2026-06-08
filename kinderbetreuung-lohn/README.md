# Lohnabrechnung Kinderbetreuung

Vereinfachte Lohnabrechnung (VAV/VAVplus) für Kinderbetreuung im Privathaushalt. React + Vite + TypeScript frontend, Supabase backend (Postgres, Auth via Magic Link, RLS).

## Funktionen

- **Mehrere Kantone.** Wähle in den Stammdaten den Kanton des Haushalts. Daraus
  ergeben sich die zuständige Ausgleichskasse (Beschriftung) sowie **Richtwerte**
  für den FAK-Satz und die Feiertagszulage, die du beim Anlegen einer
  Beitragssatz-Version übernehmen kannst. AHV/IV/EO, ALV und die VAV-Quellensteuer
  (5 %) sind eidgenössisch einheitlich. Die kantonalen Richtwerte (FAK,
  Feiertagszulage, Mindestlohn) sind **indikativ und editierbar** — sie sind nicht
  zentral verbindlich publiziert, ändern jährlich (FAK-Reform 2026–29) und sollten
  mit der zuständigen Ausgleichskasse geprüft werden.
- **Stundenlohn oder Monatslohn.** Pro Person wählbar. Monatslohn-Angestellte
  erfassen keine Stunden; der Monat wird unter „Stundenerfassung" bestätigt. Ferien
  und Feiertage sind im Monatslohn enthalten (keine separate Zulage). Die
  Abrechnung, Jahresübersicht und QR-Rechnung funktionieren für beide Modelle.

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
