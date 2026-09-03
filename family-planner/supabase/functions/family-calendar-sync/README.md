# `family-calendar-sync` Edge Function

Fetches a family's connected ICS calendars on the server, expands recurring
events and writes the result to `fp_calendar_cache`. The only place in the
system that ever sees a calendar address or a login.

## Flow

```
POST /functions/v1/family-calendar-sync
Authorization: Bearer <USER_JWT>
{ "family_id": "<uuid>", "force": false, "calendar_id": "<uuid|optional>" }

→ { "calendars": [{ "id", "label", "status", "event_count", "error" }],
    "window": { "from", "to" }, "timezone": "Europe/Zurich" }
```

`status` is `synced`, `cached` (TTL not up yet), `not_modified` (ETag) or
`error`.

1. Check the JWT (`auth.getUser()` with the anon key and the caller's header).
2. Check membership. This is explicit, because the service-role client after
   it bypasses RLS. **Every** role may trigger a run, a viewer too: the run
   changes nothing, it only refreshes the cache.
3. Per calendar: check the TTL (`fp_calendars.ttl_minutes`, 30 by default).
   Fresh and no `force` means nothing to do.
4. Read the secret, check the URL (https only, no private addresses), fetch it
   (Basic auth optional, `If-None-Match`, 15 s timeout, 5 MB cap).
5. Parse with `ics.ts`, expand into the window −92 … +400 days, write
   `fp_calendar_cache` and set `last_synced_at` / `last_error`.

The URL is nowhere in the response. `sanitizeError()` strips URLs and host
names out of error messages before they reach `last_error`, a field every
family member can read.

## `ics.ts`

A dependency-free iCalendar reader (RFC 5545): line folding,
`DTSTART`/`DTEND`/`DURATION`, all-day events (`VALUE=DATE`, exclusive `DTEND`
→ inclusive end date), `TZID` wall clock to UTC, `RRULE`
(DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY including an
ordinal, BYMONTHDAY, BYMONTH), `EXDATE`, `RECURRENCE-ID` exceptions and
`STATUS:CANCELLED`.

Time zones are the least reliable part of someone else's feed. So
`resolveZone()` takes not only IANA names but also fixed offsets (`GMT+0200`,
`(UTC+01:00) Amsterdam, Berlin`) and the Windows names Outlook writes
(`W. Europe Standard Time`). Anything else falls back to the family's zone.
Passed to `Intl.DateTimeFormat` unchecked, such a TZID threw a `RangeError`
and took the whole run down with it. For the same reason every event is
expanded on its own: one unreadable entry costs that entry, not the calendar.

No Deno or browser APIs on purpose, so the frontend's vitest suite
(`family-planner/tests/ics.test.ts`) checks the very same code.

## Configuration

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` come from
the runtime. On top of those there is **one** secret of our own:

```bash
supabase secrets set CALENDAR_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  --project-ref tbknudbcgaarqixweizj
```

It encrypts the calendar address and login (JWE, `dir` + `A256GCM`, through
`jose`; the version is pinned in the import map `deno.json` next to this file,
so `crypto.ts` uses the same plain `from 'jose'` under Deno and under vitest).
The key sits here and not in the database — that is the whole point. A
database dump then holds containers and no key.

**Without the key** existing calendars are still fetched (plaintext from
before is recognised), but *saving* a calendar is refused with a clear
message instead of quietly writing plaintext.

**A lost key** means addresses and passwords cannot be recovered and have to
be typed in once more. The cached events are not touched.

**Changing the key** takes a short detour today, there is no rotation: keep
the old key until every calendar has been saved once, then switch. With one
calendar, typing it in again is quicker.

## Saving

`{ action: 'save', family_id, calendar_id?, label, url, username, password,
color, enabled }` creates or changes a calendar. The function checks the same
condition the RPC `fp_upsert_calendar` used to check — role `owner` in this
family — normalises the URL, encrypts it and writes it with the service-role
key. An empty URL while editing keeps the stored one.

## Deployment

A push to `main` runs `.github/workflows/family-planner-supabase.yml`. The
general `supabase-functions.yml` in the repo root only deploys functions under
the root `supabase/functions/` and leaves this one alone.

By hand:

```bash
supabase functions deploy family-calendar-sync --project-ref tbknudbcgaarqixweizj
```

## Locally

```bash
supabase functions serve family-calendar-sync --env-file .env.local
curl -i -X POST http://localhost:54421/functions/v1/family-calendar-sync \
  -H "Authorization: Bearer <USER_JWT>" -H "Content-Type: application/json" \
  -d '{"family_id":"<uuid>","force":true}'
```
