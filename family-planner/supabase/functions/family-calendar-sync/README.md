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
exklusiv → inklusives Enddatum), `TZID`-Wandzeiten nach UTC,
`RRULE` (DAILY/WEEKLY/MONTHLY/YEARLY mit INTERVAL, COUNT, UNTIL, BYDAY inkl.
Ordinalzahl, BYMONTHDAY, BYMONTH), `EXDATE`, `RECURRENCE-ID`-Ausnahmen,
`STATUS:CANCELLED`.

Zeitzonen sind der unzuverlässigste Teil eines fremden Feeds. `resolveZone()`
nimmt deshalb nicht nur IANA-Namen, sondern auch feste Offsets (`GMT+0200`,
`(UTC+01:00) Amsterdam, Berlin`) und die Windows-Namen aus Outlook
(`W. Europe Standard Time`); alles andere fällt auf die Zeitzone der Familie
zurück. Ungeprüft an `Intl.DateTimeFormat` weitergereicht, warf so ein TZID
einen `RangeError` und riss den kompletten Abruf mit sich. Aus demselben Grund
wird jeder Termin einzeln expandiert: ein unlesbarer Eintrag kostet diesen
Eintrag, nicht den Kalender.

Bewusst frei von Deno-/Browser-APIs, damit die vitest-Suite des Frontends
(`family-planner/tests/ics.test.ts`) exakt denselben Code prüft.

## Konfiguration

`SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` stellt die
Laufzeit bereit. Dazu kommt **ein** eigenes Secret:

```bash
supabase secrets set CALENDAR_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  --project-ref tbknudbcgaarqixweizj
```

Damit werden Kalender-Adresse und Zugangsdaten verschlüsselt abgelegt (JWE,
`dir` + `A256GCM`, über `jose`). Der Schlüssel liegt bewusst hier und nicht in
der Datenbank — das ist der ganze Punkt: ein Datenbank-Dump enthält dann nur
Container ohne Schlüssel.

**Ohne den Schlüssel**: Bestehende Kalender werden weiter abgerufen (Klartext
aus der Zeit davor wird erkannt), aber das *Speichern* eines Kalenders lehnt
die Funktion mit einer klaren Meldung ab, statt still Klartext zu schreiben.

**Schlüssel verloren** heisst: Adressen und Passwörter sind nicht
wiederherstellbar und müssen einmal neu eingegeben werden. Die Termine im
Zwischenspeicher bleiben unberührt.

**Schlüssel wechseln** braucht heute einen kurzen Zwischenschritt — es gibt
keine automatische Rotation: alten Schlüssel behalten, bis jeder Kalender
einmal gespeichert wurde, dann umstellen. Bei einem Kalender ist Neueingeben
schneller.

## Speichern

`{ action: 'save', family_id, calendar_id?, label, url, username, password,
color, enabled }` legt einen Kalender an oder ändert ihn. Die Funktion prüft
dieselbe Bedingung, die vorher die RPC `fp_upsert_calendar` geprüft hat —
Rolle `owner` in dieser Familie — normalisiert die URL, verschlüsselt sie und
schreibt sie mit dem Service-Role-Key. Eine leere URL beim Bearbeiten behält
die gespeicherte.

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
