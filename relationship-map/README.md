# Relationship Map

Digitises the pen-and-paper exercise: put **yourself in the centre** and draw a
line to everyone in your life — partner, teammates, friends, the security guard
at work — then rate each relationship **1–10** (10 = extremely deep and strong).
Unlike the paper version, this one **remembers**: every rating change is logged,
so you can scrub a time slider and watch your relationships evolve.

![concept](./public/concept.svg)

## Features

- **Radial map** — you at the centre; each person is a node whose **distance**
  encodes closeness (10 = closest) and **colour** encodes their group. Each group
  owns a fixed angular **wedge**; uncategorised people fan out around the circle.
- **Drag to edit** — drag a node toward/away from the centre to set its closeness,
  and into a group's wedge to recategorise it. Rating changes are logged, so they
  show up on the time slider. (Live map only; historical views are read-only.)
- **Import from your devices** — bootstrap the map from WhatsApp, iMessage, Apple
  Mail and Contacts; see [Import](#import-from-your-devices) below.
- **Living map + change log** — there's one current map; every closeness change
  is appended to an immutable log with a timestamp and optional note.
- **Time travel** — a slider reconstructs the whole map at any past date from the
  log. Per-person trend charts show closeness over time.
- **Groups** (family / partner / friends / work / …) with custom colours, and a
  **contact-frequency** field per person (separate from emotional closeness).
- **Local-first** — all data lives in a single SQLite file on your disk.

## Stack

- Frontend: React 19 + TypeScript + Vite (hand-rolled SVG, no chart libs).
- Backend: Express + `better-sqlite3`, run with `tsx`.
- Tests: Playwright (e2e against the built app).

## Requirements

- **Node 22** (`nvm use`).
- `better-sqlite3` is a native addon compiled at install time — you need
  **Python 3** and a **C/C++ toolchain** (`build-essential` on Linux, Xcode
  Command Line Tools on macOS). It compiles against the running Node version, so
  install with the same Node you run.

## Install

```bash
nvm use
npm install
```

## Run

**Development** (API on `:8787`, Vite on `:5173` with a `/api` proxy):

```bash
npm run dev
```

Open <http://localhost:5173>.

**Production / preview** (single server serving the built SPA + API on `:8787`):

```bash
npm run build
npm start
# open http://localhost:8787
```

Other scripts: `npm run typecheck`, `npm test` (Playwright), `npm run test:unit`
(import-pipeline unit tests), `npm run test:ui`.

## Import from your devices

Instead of adding everyone by hand, import your real relationships and let
**interaction frequency** place them. The importer reads four local sources
**read-only** and writes into the app database:

| Source | Where it reads |
|--------|----------------|
| WhatsApp | the local `whatsapp-mcp` bridge store (`messages.db`) |
| iMessage | `~/Library/Messages/chat.db` |
| Apple Mail | `~/Library/Mail/.../Envelope Index` (all accounts configured in Mail.app) |
| Contacts | `~/Library/Application Support/AddressBook` (names, phones, emails) |

Run it from the toolbar (**Import contacts**) or the CLI:

```bash
npm run import
```

**Requires Full Disk Access** for your terminal/app (System Settings → Privacy &
Security → Full Disk Access) so it can read `chat.db` and the Mail index.

How it works:

- **Recency-weighted scoring** — every message contributes a weight that halves
  every ~180 days, so recent, frequent contact ranks highest.
- **Backfilled history** — a rating per person is reconstructed month by month
  from your message history, so the time slider scrubs real relationship history.
- **Top relationships placed** — the strongest ~50 are placed (uncategorised,
  spread around the circle); everyone else is imported but **archived/hidden** and
  can be un-hidden or dragged in later. Drag nodes to fine-tune.
- **Identity matching** — a contact is matched across channels by phone (last 9
  digits) and email; unknown messaging numbers become their own nodes, but unknown
  email senders (newsletters, notifications) are ignored.
- **Self-exclusion** — your own "me" card (and duplicates of it) are filtered out.
- **Re-runnable** — re-importing updates in place (no duplicates) and **preserves
  your manual drag edits**; only import-generated history is recomputed.

Everything stays local — nothing is uploaded. Tune behaviour with env vars:
`IMPORT_PLACE_LIMIT`, `IMPORT_HALF_LIFE_DAYS`, `IMPORT_MIN_UNKNOWN_EVENTS`,
`IMPORT_SELF_HANDLES`, and `IMPORT_*_DB`/`IMPORT_CONTACTS_DIR` path overrides.

**Threema is not supported** — it's end-to-end encrypted with no readable local
store, so interaction frequency can't be extracted. Add Threema contacts by hand.

## Data, backup & restore

All data lives in **`data/relationship-map.db`** (a SQLite file, plus transient
`-wal` / `-shm` siblings). The whole `data/` folder is gitignored — it's yours to
back up. Override the location with the `DB_PATH` env var.

**Backup** — easiest is a clean single-file snapshot while the app runs:

```bash
sqlite3 data/relationship-map.db "VACUUM INTO 'backup-$(date +%F).db'"
```

Or stop the app and copy `relationship-map.db` together with its `-wal` and
`-shm` files. A JSON dump is also available at `GET /api/export`.

**Restore** — stop the app, replace `data/relationship-map.db` with your backup
(remove any stale `-wal`/`-shm`), then start again.

## Data model

- `people` — name, group, contact frequency, cached `current_rating`, archived,
  plus `source` (`manual`/`import`) and a unique `external_key` for import dedup.
- `rating_log` — append-only; every closeness change (including the initial one)
  with a timestamp, optional note, and `source` so re-import can replace only its
  own backfilled history while keeping your manual edits.
- `categories` — groups with a colour. `settings` — your name (the centre).

The map's live state is a cache; the log is the source of truth, so any past map
can be reconstructed: a person's rating at time *t* is their latest log entry
with `changed_at <= t`.

**v1 simplification:** only *ratings* are versioned over time. A person's group,
contact frequency and archived state reflect their current values in historical
views, not what they were at that moment.
