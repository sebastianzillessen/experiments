# `family-calendar-sync` Edge Function

Ruft die verbundenen ICS-Kalender einer Familie serverseitig ab, löst
Serientermine auf und legt das Ergebnis in `fp_calendar_cache` ab. Die einzige
Stelle im System, die eine Kalender-Adresse oder Zugangsdaten zu sehen bekommt.

## Ablauf

```
POST /functions/v1/family-calendar-sync
Authorization: Bearer <USER_JWT>
{ "family_id": "<uuid>", "force": false, "calendar_id": "<uuid|optional>" }

→ { "calendars": [{ "id", "label", "status", "event_count", "error" }],
    "window": { "from", "to" }, "timezone": "Europe/Zurich" }
```

`status` ist `synced`, `cached` (TTL noch nicht abgelaufen), `not_modified`
(ETag) oder `error`.

1. JWT prüfen (`auth.getUser()` mit dem Anon-Key und dem Header des Aufrufers).
2. Mitgliedschaft prüfen — explizit, weil der Service-Role-Client danach RLS
   umgeht. **Jede** Rolle darf auslösen, auch ein Betrachter: der Abruf ändert
   nichts, er aktualisiert nur den Zwischenspeicher.
3. Pro Kalender: TTL prüfen (`fp_calendars.ttl_minutes`, Standard 30) — frisch
   und kein `force` ⇒ nichts tun.
4. Secret lesen, URL prüfen (nur https, keine privaten Adressen), abrufen
   (Basic-Auth optional, `If-None-Match`, 15 s Timeout, 5 MB Limit).
5. Mit `ics.ts` parsen und ins Fenster −92 … +400 Tage auflösen, dann
   `fp_calendar_cache` schreiben und `last_synced_at`/`last_error` setzen.

Die URL erscheint nirgends in der Antwort. `sanitizeError()` entfernt URLs und
Hostnamen aus Fehlermeldungen, bevor sie in `last_error` landen — dieses Feld
lesen alle Familienmitglieder.

## `ics.ts`

Abhängigkeitsfreier iCalendar-Leser (RFC 5545): Zeilenfaltung,
`DTSTART`/`DTEND`/`DURATION`, ganztägige Termine (`VALUE=DATE`, `DTEND`
exklusiv → inklusives Enddatum), `TZID`-Wandzeiten über `Intl` nach UTC,
`RRULE` (DAILY/WEEKLY/MONTHLY/YEARLY mit INTERVAL, COUNT, UNTIL, BYDAY inkl.
Ordinalzahl, BYMONTHDAY, BYMONTH), `EXDATE`, `RECURRENCE-ID`-Ausnahmen,
`STATUS:CANCELLED`.

Bewusst frei von Deno-/Browser-APIs, damit die vitest-Suite des Frontends
(`family-planner/tests/ics.test.ts`) exakt denselben Code prüft.

## Konfiguration

Keine eigenen Secrets. `SUPABASE_URL`, `SUPABASE_ANON_KEY` und
`SUPABASE_SERVICE_ROLE_KEY` stellt die Laufzeit bereit.

## Deployment

Push auf `main` löst `.github/workflows/family-planner-supabase.yml` aus (die
allgemeine `supabase-functions.yml` im Repo-Root deployt nur Funktionen unter
`supabase/functions/` im Root und fasst diese hier nicht an).

Manuell:

```bash
supabase functions deploy family-calendar-sync --project-ref tbknudbcgaarqixweizj
```

## Lokal

```bash
supabase functions serve family-calendar-sync --env-file .env.local
curl -i -X POST http://localhost:54421/functions/v1/family-calendar-sync \
  -H "Authorization: Bearer <USER_JWT>" -H "Content-Type: application/json" \
  -d '{"family_id":"<uuid>","force":true}'
```
