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
- **Einladen per E-Mail oder Link.** Owner/Admins laden weitere Personen in den
  Haushalt ein — entweder klassisch per E-Mail-Adresse (Anmelde-Link wird
  zugestellt) oder, wenn die E-Mail-Adresse unbekannt ist, per **Einladungs-Link**.
  Der Link (`…?invite=<token>`) wird frei geteilt (z. B. Chat); wer ihn öffnet,
  registriert sich mit einer beliebigen E-Mail-Adresse und wird automatisch dem
  Haushalt mit der vorgegebenen Rolle zugeordnet. Der Token wird serverseitig beim
  Registrieren eingelöst (`handle_new_user`), sodass kein eigener Haushalt angelegt
  wird; ein bereits angemeldeter Nutzer löst ihn über `accept_invite_by_token` ein.
  Jeder Link gilt für eine Person (Single-Use).
- **Monat abschliessen.** In der Monatsabrechnung kann ein Monat pro
  Mitarbeiter/in abgeschlossen (signiert) werden. Danach sind die Einsätze dieser
  Person in diesem Monat gesperrt — sie lassen sich nicht mehr ändern oder löschen
  (per Datenbank-Trigger erzwungen) und verschwinden aus der Stundenerfassung.
  Andere Mitarbeitende bleiben davon unberührt. Owner/Admins können den Monat
  einer Person bei Bedarf wieder öffnen.
- **Stundenlohn oder Monatslohn.** Pro Person wählbar. Monatslohn-Angestellte
  erfassen keine Stunden; der Monat wird unter „Stundenerfassung" bestätigt. Ferien
  und Feiertage sind im Monatslohn enthalten (keine separate Zulage). Die
  Abrechnung, Jahresübersicht und QR-Rechnung funktionieren für beide Modelle.
- **Mitarbeitende im AHV-Referenzalter (Rentner/innen).** Pro Person als
  „im AHV-Referenzalter" markierbar. Dann entfällt die ALV, und AHV/IV/EO sowie
  FAK werden nur auf dem Lohn über dem Rentnerfreibetrag erhoben. Der Freibetrag
  (CHF 16'800/Jahr) wird pro Monat als CHF 1'400 abgebildet (in den Einstellungen
  anpassbar) — passend zum monatsweisen Abrechnungsmodell. Optional kann pro
  Person auf den Freibetrag verzichtet werden (Beiträge dann auf dem ganzen Lohn).
  UVG und die Quellensteuer bleiben unverändert.
- **Feiertagszuschlag pro Arbeitsverhältnis.** Pro Stundenlohn-Person wählbar:
  kein Zuschlag (0 %), nur der 1. August (0.39 %, gesetzliches Minimum nach
  Art. 110 Abs. 3 BV) oder alle 9 bezahlten Feiertage (kantonaler Satz aus den
  Einstellungen). Neue Personen starten mit „Nur 1. August"; bestehende behalten
  die volle Variante, bis sie bewusst umgestellt werden. Ferien- und
  Feiertagszulage werden separat auf dem Grundlohn berechnet (nicht auf
  Grundlohn + Ferienzulage), wie beim SECO.
- **Nachvollziehbare Rundung.** Alle Positionen werden auf den Rappen gerechnet;
  nur der Auszahlungsbetrag wird auf 5 Rappen gerundet und die Rundungsdifferenz
  als eigene Zeile ausgewiesen. Die Abrechnung warnt bei Einsätzen in der Zukunft
  („Vorschau") und bei Einsätzen an Sonntagen/Feiertagen.

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
npm run test:unit      # Vitest unit tests for the payroll calculation (no Supabase needed)
npm test               # Playwright e2e (starts/reset local Supabase, builds site, serves on :8080)
npm run test:ui        # Playwright UI mode
```

`src/lib/payroll.test.ts` pins the payroll math against the documented
November 2026 reference payslip (Feiertagszuschlag variants, rounding).

`tests/e2e/visual.spec.ts` contains visual regression tests. Baselines (in `visual.spec.ts-snapshots/`) were captured on macOS/Chromium and are platform-tied; regenerate with `npx playwright test visual --update-snapshots` when intentionally changing the UI.
