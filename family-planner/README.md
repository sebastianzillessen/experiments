# Familienplaner

The family's week as a table: **rows = days, columns = people** — the same
shape as the paper sheet on the fridge. Events from the shared calendar land in
the right column on their own, and a new entry takes a few seconds.

React + Vite + TypeScript, PWA (installable on the home screen), Supabase as
the backend. Runs on **https://planer.zillessen.dev**.

The user interface is German; the code and its comments are English.

## Features

- **Week and month view.** The week is the default (calendar week, Mon–Sun);
  the month shows the same table with every day of the month. Today is
  highlighted, weekends are set apart. On a phone the table becomes one list
  per day, and printed the week fits on one sheet.
- **Calendar connection (ICS).** The owner enters the secret iCal address of
  the shared calendar — `https://…` or a `webcal://` link as iCloud and Apple
  Calendar hand it out (turned into https on the server). A Supabase Edge
  Function fetches it server side (no CORS problem, no address in the
  browser), expands recurring events and caches the result. Several viewers
  cost one fetch, not one each.
- **Automatic assignment.** Events move into the columns by the names in their
  text: "Kita Miri/Lars" shows up for Miri **and** for Lars. In the column the
  name then drops out — "Caro LQ" reads as *LQ* for Caro, "[Caro] Reitstunde"
  as *Reitstunde*, "Zusätzliche Betreuung Lars und Miriam KiTa" as
  *Zusätzliche Betreuung KiTa* for both. The column answers who, the chip only
  what; the detail view still holds the full text. Matching is on word
  boundaries and ignores case and umlauts, so "Lars" does not hit "Larsson".
  Each person can carry further spellings ("Lasse", "L.", "Lillian"), and when
  you move an event the detail view offers its words as aliases right away, so
  "Lillian Mittagessen Hort" has to be corrected only once. If something is
  still wrong, the assignment for that event is overridden or the event is
  hidden. The calendar itself stays as it is.
- **Quick entry.** Title, people (pick several), date — done. All-day is the
  default, "von–bis" reveals the time fields. Entries over several days
  (holidays) run across all days they touch. A tap on an empty cell already
  fixes the day *and* the person.
- **A time inside the title.** "Zahnarzt 14-15" becomes an entry *Zahnarzt*
  from 14:00 to 15:00. Read are `14-15`, `16:10-16:55`, `16.10-16.55`,
  `14 bis 15:15`, `9-10 Uhr`, `14 Uhr 30`, `2-3pm`, `ab 15`, `um 18` — and
  deliberately **not** "Zimmer 12", "KW 37", "Zimmer 3-5", "Lilly bis 16:00
  Hort" or a date like "1.10.". What was read stands under the field and one
  tap throws it away.
- **Recurring entries.** "Kita jeden Freitag für Lars und Miriam" is typed in
  once: weekly, with weekdays (several too: Mon + Thu), an interval (every /
  every 2nd, 3rd, 4th week) and an end date if you want one. Without an end
  date the series runs on. When editing and deleting, the app asks "this date"
  or "all dates", so a single holiday drops out without breaking the series.
  The repetition is read from the title as well: "Kita jeden Freitag 8-16",
  "Hort freitags", "Putzen jeden 2. Freitag", "montags und donnerstags" (but
  not "Montagsmarkt" and not "Freitag Zahnarzt", which is a date, not a
  series).
- **Several viewers.** A family has any number of logins with different
  rights; you invite by link.
- **Times written short in the table.** A chip shows `8–13`, not `08:00–13:00`
  — the leading zero and whole `:00` minutes are dropped, because in a column
  six people wide those characters decide whether an entry fits on one line.
  The detail view keeps the full form. An entry that repeats its own time in
  its text ("GM schaut auf Lars 8:00-13:00") has it removed from the chip, the
  same way the person's name is: the column answers who, the time answers when,
  the chip only has to answer what.
- **Kiosk mode** for a wall-mounted iPad: dark, awake, blanked when nobody is
  there, refreshed every 15 minutes. See below.
- **Time format per family.** Settings → Anzeige switches between 24 hours
  (`14:00–15:15`) and AM/PM (`2:00–3:15 PM`). It applies to everything the
  planner writes itself. The time picker for a new entry is a native browser
  control, so the operating system decides what format it shows (on iOS:
  Settings → General → Date & Time → 24-Hour Time). The stored value is the
  same either way.

## Kiosk mode on an iPad

Switch it on under **Settings → Anzeige → Kiosk-Modus**, or open the app as
`https://planer.zillessen.dev/?kiosk=1` and add *that* to the home screen. The
setting is per device — only the tablet on the wall wants a screensaver, so it
is not a family setting like the time format — and is remembered from then on,
so a relaunch keeps it. `?kiosk=0` switches it off again, as does the same
switch.

What changes:

- **The screen stays awake** (Screen Wake Lock), so iPadOS does not lock the
  device and lose the plan.
- **A dark theme**, because a bright plan standing still for weeks is what
  burns in. It matters most on the OLED iPad Pro; every other iPad is LCD and
  only ever shows temporary after-images.
- **The plan is nudged by up to 3 px** every minute, so no pixel keeps showing
  the same table rule.
- **After 5 minutes without a touch the screen goes black**, with a dim clock
  that moves around. A touch anywhere brings the plan back. Before going dark
  the view returns to this week, so whoever walks up finds today rather than
  wherever someone left off paging.
- **The iPad's status bar follows the plan.** iOS paints it from
  `theme-color`, which is otherwise the app's green — a green bar above a dark
  plan, and above the black screen the only thing lit on the whole wall. It
  turns dark with the theme and black under the curtain, and is already dark at
  launch so nothing flashes green on the way in.
- **Today is scrolled into view** whenever it is among the days on screen.
- **The calendars are pulled every 15 minutes.** Both timers count elapsed
  time, so an iPad that slept through the night does not owe 40 syncs on
  waking.

Timings can be changed: `?kiosk=1&idle=10&refresh=30` (minutes; idle 1–120,
refresh 1–240).

Worth knowing before you mount it: **no web app can switch the display off, and
none can switch it back on** — a native app cannot either, iOS has no interface
for it. So the black screen is a cover over a lit display, not the iPad's own
sleep. Presence detection through the camera would not change that, which is
why there is none.

On the iPad itself:

- **Guided Access** (Settings → Accessibility) locks the device to the app:
  start it, then triple-click the side button. For a tablet that hangs on the
  wall for good, **Single App Mode** through Apple Configurator survives a
  restart as well.
- Set **Auto-Lock to Never** as a belt-and-braces measure next to the wake
  lock.
- On an iPad with Face ID, **Attention Aware Features** keeps the display from
  dimming while somebody is looking at it.

## School lunch menu

The school publishes one PDF per calendar week. Those PDFs are **scans** — one
embedded JPEG per page, no text layer at all — so there is nothing to parse:
the page goes to Claude (`claude-opus-5`) and comes back as checked JSON. About
three to four Rappen per week, so a couple of francs a school year.

Set it up under **Settings → Menüplan**: the folder the school publishes in,
and one or more file-name patterns filled in per week — `{KW}.{JJ}.pdf` gives
`37.26.pdf`. Several patterns are tried in turn, which covers a school that
writes `7.26.pdf` one week and `07.26.pdf` the next. The form shows what each
pattern resolves to, so nobody has to work that out in their head. A family can
have more than one source: children at two schools eat two different lunches.

Then tick which children eat there and on which weekdays — a child in school
Monday to Wednesday is not shown Thursday's lunch. The dishes appear as an
entry in that child's own column on those days, in their own colour.

A dish the model cannot read with confidence is left out rather than guessed
at, and what comes back is checked against the week it was asked for before
anything is stored. Details and the required `CLAUDE_API_KEY` secret are in
`supabase/functions/family-menu-import/README.md`.

## Roles

Deliberately different from Salärli's owner/admin/employee:

| | Owner | Editor | Viewer |
|---|---|---|---|
| See the plan, people and calendar colours | ✓ | ✓ | ✓ |
| Add, change, delete entries; change an assignment | ✓ | ✓ | — |
| Keep people (columns) and their spellings | ✓ | ✓ | — |
| Connect a calendar, enter address and login | ✓ | — | — |
| Invite, change roles, rename the family | ✓ | — | — |
| **Read** a calendar address or login | — | — | — |

Viewers are meant for grandparents, childcare or the older children: see the
plan, change nothing.

## Login

Same infrastructure as Salärli: **the same Supabase project**, so an existing
login works right away — sign-in link (magic link), password or a new account.
Only the data is apart: every table of this app is named `fp_*` and has
nothing to do with Salärli's household tables.

There is **no** `auth.users` trigger: signing up for Salärli does not create an
empty family, and the other way round. A signed-in user without a family gets
the "Familie anlegen" screen (RPC `fp_create_family`); an invited one simply
opens their link (`…?invite=<token>`).

## Security: where the calendar credentials live

The secret ICS address is a password. Whoever holds it reads the whole family
calendar without logging in. So it never leaves the server again:

1. **`fp_calendar_secrets`** (URL, user, password) holds those values
   **encrypted**: JWE with `dir` + `A256GCM`, written by `jose`. The key
   (`CALENDAR_ENCRYPTION_KEY`) is an Edge Function secret and **not in the
   database**, so a database dump or a leaked service-role key yields
   containers without a key. On top of that the table has RLS on and
   **deliberately not a single policy**: `anon` and `authenticated` see zero
   rows there.
2. **Writing** goes only through the Edge Function (`{ action: 'save', … }`),
   which requires `owner` in this family, encrypts, and then writes with the
   service-role key. The earlier RPC `fp_upsert_calendar` is gone; it would
   have been a way to get plaintext into the table. Rows from before stay
   readable and are written back encrypted on the next fetch.
3. **Reading back** does not exist. The interface shows only
   `fp_calendars.url_preview` — host plus the last characters, e.g.
   `calendar.google.com/…/basic.ics`. While editing, an empty URL field means
   "keep the stored address".
4. **Fetching** is for `family-calendar-sync` alone: check the JWT → check
   membership → read the secret with the service role → fetch. The URL shows
   up neither in the response nor in a log nor in `last_error`; error messages
   are stripped of URLs and host names first.
5. **SSRF guard.** Only `https://` (and `webcal://` / `webcals://` → https, as
   a text replacement *before* parsing: the `protocol` setter of the URL API
   refuses to turn a non-special scheme like `webcal` into `https`, and does
   so silently). Localhost, `*.local`, private IPv4 ranges and IPv6 loopback
   are rejected, plus a timeout (15 s) and a size cap (5 MB).
6. **Credentials** are sent only as HTTP basic auth over TLS and are
   write-only in the interface (leave empty = unchanged).
7. **Invite links** are 64 random hex characters (two v4 UUIDs, ~244 bits),
   usable once. `fp_invite_info(token)` can be called without a login but
   tells only the family name for a token the caller already has.

A viewer can read `fp_calendar_cache.events` of their own family — that is the
point of them — but write nowhere and see no other family: every policy is
bound through `fp_role_in(family_id)`.

## Data model

```
fp_families ─┬─ fp_memberships (user_id, role)        ← logins
             ├─ fp_people                              ← columns of the planner
             ├─ fp_events ─┬─ fp_event_people          ← typed in
             │             └─ fp_event_exceptions      ← single dates dropped
             ├─ fp_calendars ─┬─ fp_calendar_secrets   ← no policy!
             │                └─ fp_calendar_cache     ← fetched events
             ├─ fp_calendar_assignments                ← manual corrections
             ├─ fp_menu_sources ─┬─ fp_menu_weeks       ← imported lunches
             │                   └─ fp_menu_people      ← who eats, which days
             └─ fp_invites
```

All-day entries use `start_date`/`end_date` (end **inclusive**, the way a
person reads a planner); entries with a time add `starts_at`/`ends_at`. A
series is **one** row: `repeat_freq`, `repeat_interval`, `repeat_weekdays` and
`repeat_until` hold the rule, `starts_at`/`ends_at` the first date. It is
expanded in the client for the days on screen only, and with `expandRule()`
from the ICS parser, so the project has one repetition logic and not two. The
time of each date is worked out again from the wall clock, so 14:00 stays
14:00 after the clocks change. A single changed date is an exception plus a
standalone entry, which keeps expanding free of special cases. The cache holds
**one** JSONB row per calendar with the expanded window (−92 to +400 days):
the planner always reads a whole window, the sync writes it in one go, and
viewers need no write right.

## Setup

```bash
npm install                        # in the repo root (npm workspaces)
cp config.example.js config.js     # enter the Supabase URL + publishable key
npm run dev -w @experiments/family-planner
```

Needed once:

- **Set the encryption key.** Without it no calendar can be saved:
  ```bash
  supabase secrets set CALENDAR_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
    --project-ref tbknudbcgaarqixweizj
  ```
- **Auth → URL Configuration → Redirect URLs**: `https://planer.zillessen.dev/**`
- Cloudflare dashboard: custom domain `planer.zillessen.dev` on the
  `experiments` worker (the worker rewrites the host to `_site/family-planner/`).

## Development

```bash
npm run dev        # Vite on :8081
npm run typecheck
npm test           # vitest (pure logic, no Supabase needed)
npm run build      # tsc -b && vite build → dist/
```

Tested is where the bugs sit: the ICS parser including time zones and
recurrence rules, name matching, date arithmetic, merging both sources into
the table cells, the calendar URL check including `webcal://` and the SSRF
guard, the encryption of the credentials with its migration of old plaintext,
both time formats, reading times **and repetitions** out of a title, expanding
a series across a change of the clocks, stripping names from the display, the
kiosk settings with their two burn-in drifts, the menu import's week
arithmetic and its check on what the model returned, the file-name patterns
with their escape attempts, which child sees which lunch, and the short time
format down to which repeated times may be dropped (234 tests).

For production `build.sh` in the repo root builds it (`bash build.sh
family-planner`) and writes `config.js` from `SUPABASE_URL` /
`SUPABASE_PUBLISHABLE_KEY`.

## Preview deployments

Cloudflare builds **every branch**. The branch preview serves the app under the
path `/family-planner/` (the host rewrite applies to `planer.zillessen.dev`
only). Two things to keep in mind:

- The database is **not** deployed per branch. Migrations and the Edge
  Function run on a push to `main` (or by hand under *Actions → Family Planner
  — Supabase → Run workflow*). If they are missing, the app reports that
  `fp_create_family` does not exist when you create the family.
- Signing in by link needs the preview URL to be listed in Supabase under
  Auth → Redirect URLs. Signing in with a password works on any host without
  further configuration.

## Deployment

- **Frontend**: Cloudflare Worker + static assets (see `wrangler.jsonc`).
  `planer.zillessen.dev` is rewritten internally to `/family-planner`.
- **Database and Edge Function**:
  `.github/workflows/family-planner-supabase.yml` on a push to `main`. Because
  `supabase db push` needs the complete migration history, the job copies the
  migrations of both experiments into a temporary project directory and pushes
  from there.

## Not built yet

Prepared on purpose but not built — visible in the settings as disabled
entries:

- **Writing back** into the calendar (the connection reads only today).
- **Office 365 / Exchange calendars.** The field `fp_calendars.kind` already
  knows the type; OAuth tokens would go into the same protected secrets table.
- Notifications.
