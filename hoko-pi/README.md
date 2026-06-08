# hoko-pi

Bring-up stack that runs **on the Raspberry Pi** alongside Home Assistant to
push every Hoko guest registration to the Kanton Zürich Hotelkontrolle portal
without any manual click.

## Architecture

```
guest fills form
        │
        ▼
  Cloudflare Worker  ───► email + KV   (already shipped)
        ▲
        │ GET /api/hoko/list?since=…  (Bearer auth)
        │ GET /api/hoko/<code>.xls   (binary BIFF8)
        │
   ┌────┴─────────────────┐
   │ Raspberry Pi (HA Supervised)
   │                       │
   │  ┌─── puller ─────┐   │
   │  │ Node 22, polls │   │
   │  │ every 1 h      │   │
   │  └──────┬─────────┘   │
   │         ▼ /upload     │
   │  ┌─── dts-client ───┐ │
   │  │ Java 17 + jsvc   │ │
   │  │ Unisys DTS 4.2.7 │ │
   │  └──────┬───────────┘ │
   └─────────┼─────────────┘
             ▼ SOAP+TLS
   sidap.hotelkontrolle.zh.ch
```

Two containers in a single `docker compose` stack:

| Service       | What it does                                               |
|---------------|------------------------------------------------------------|
| `puller`      | Every hour, fetches new submissions from the Worker and drops `meldeschein-<code>.xls` files into a shared volume. |
| `dts-client`  | Watches the same volume and ships files to the canton via Unisys' DTS daemon. |

The puller's last-seen timestamp + processed-code list live in a named volume
so restarts don't re-download or re-upload.

## Prerequisites

1. **SIDAP service account** — username and password issued by the canton,
   separate from your Hotelkontrolle web login. The DTS daemon will refuse to
   start without them.
2. **HOKO_PULLER_TOKEN** secret bound on the Worker
   (`npx wrangler secret put HOKO_PULLER_TOKEN`). Generate any random string
   (`openssl rand -hex 32`); put the same value in `.env` below.
3. **Docker + Docker Compose** on the Pi (already present with HA Supervised).
4. **The DTS install zip** at `hoko-cli/dts-client-sidap-install.zip` in this
   repo — already committed.

## Setup

```bash
git clone <this repo> && cd experiments/hoko-pi
cp .env.example .env
$EDITOR .env             # fill in HOKO_PULLER_TOKEN + SIDAP_USER/PASS
docker compose up -d --build
docker compose logs -f
```

First run prints:

```
hoko-puller    | [2026-…] hoko-puller started
hoko-puller    |   api:           https://hoko.zillessen.dev
hoko-puller    |   upload dir:    /upload
hoko-puller    |   interval:      3600s
hoko-puller    |   last-seen:     2026-…
hoko-dts-client | [entrypoint] config:
hoko-dts-client | baseServiceUrl = https://sidap.hotelkontrolle.zh.ch/DtsApplService
hoko-dts-client | serviceUser = …
```

By default the puller starts "now" — historical submissions stay where they
are. Set `START_BACKFILL_DAYS=30` in `.env` for a one-time backfill, then
remove the var.

## End-to-end test

1. Submit a fake registration:

   ```bash
   npm run hoko:demo       # from the repo root, sends to prod by default
   ```

2. Wait up to `POLL_INTERVAL_SEC` (default 3600 s). Or kick the puller:

   ```bash
   docker compose restart puller
   ```

3. Watch the file appear, then the daemon pick it up:

   ```bash
   docker compose logs -f puller dts-client
   docker compose exec dts-client ls -la /opt/dts-client/Upload
   ```

## Troubleshooting

| Symptom                                  | Likely cause                                                    |
|-----------------------------------------|-----------------------------------------------------------------|
| `puller list HTTP 401`                  | `HOKO_PULLER_TOKEN` mismatch between Worker secret and `.env`. |
| `puller list HTTP 503`                  | Worker secret not set; run `npx wrangler secret put HOKO_PULLER_TOKEN`. |
| Files appear in `/upload` but never leave | DTS daemon credentials wrong or `baseServiceUrl` unreachable. Tail `dts-logs`: `docker compose exec dts-client tail -f /var/log/SiDAP/*.log`. |
| `jsvc: error while loading shared libraries` | Container is the wrong architecture for this Pi. Rebuild on the Pi (don't cross-build). |
| Daemon exits with `EnvironmentType` errors | Mandate config missing. The canton needs to set up a mandate for your account before the daemon will accept files. |

## What's intentionally not here yet

- **Home Assistant notifications** when an upload completes. Easy follow-up:
  parse the dts logback line for "upload succeeded" and `POST` to a
  webhook trigger in HA. Holding off until the skeleton runs end-to-end.
