# Familienplaner

Der Wochenplan der Familie als Tabelle: **Zeilen = Tage, Spalten = Personen** —
genau wie auf dem Papierblatt, das sonst am Kühlschrank hängt. Termine aus dem
gemeinsamen Kalender landen automatisch in der richtigen Spalte, neue Einträge
sind in wenigen Sekunden erfasst.

React + Vite + TypeScript, PWA (installierbar auf dem Homescreen), Supabase als
Backend. Läuft auf **https://planer.zillessen.dev**.

## Funktionen

- **Wochen- und Monatsansicht.** Die Woche ist die Standardansicht (KW, Mo–So),
  der Monat zeigt dieselbe Tabelle mit allen Tagen des Monats. Heute ist
  hervorgehoben, Wochenenden sind abgesetzt. Auf dem Handy wird aus der Tabelle
  eine Liste pro Tag; gedruckt passt die Woche auf ein Blatt.
- **Kalender-Anbindung (ICS).** Der Owner hinterlegt die geheime iCal-Adresse
  des gemeinsamen Kalenders — `https://…` oder ein `webcal://`-Link, wie ihn
  iCloud und Apple Kalender ausgeben (wird serverseitig auf https umgestellt). Eine Supabase Edge Function ruft ihn serverseitig
  ab (kein CORS-Problem, keine Adresse im Browser), löst Serientermine auf und
  legt das Ergebnis zwischengespeichert ab — mehrere Betrachter kosten einen
  Abruf, nicht einen pro Person.
- **Automatische Zuordnung.** Termine wandern anhand der Namen im Text in die
  Spalten: „Kita Miri/Lars“ erscheint bei Miri **und** bei Lars. Erkannt wird
  auf Wortgrenzen und ohne Rücksicht auf Gross-/Kleinschreibung oder Umlaute,
  also trifft „Lars“ nicht „Larsson“. Pro Person lassen sich weitere
  Schreibweisen hinterlegen („Lasse“, „L.“). Passt etwas nicht, wird die
  Zuordnung für diesen Termin überschrieben oder er wird ausgeblendet — der
  Kalender selbst bleibt unverändert.
- **Schnelles Erfassen.** Titel, Personen (Mehrfachauswahl), Datum — fertig.
  Ganztägig ist die Voreinstellung, „von–bis“ blendet die Zeitfelder ein.
  Mehrtägige Einträge (Ferien) laufen über alle betroffenen Tage. Ein Tipp auf
  eine leere Zelle legt Tag *und* Person schon fest.
- **Mehrere Betrachter.** Eine Familie hat beliebig viele Zugänge mit
  unterschiedlichen Rechten; eingeladen wird per Link.

## Rollen

Bewusst anders als bei Salärli (owner/admin/employee):

| | Owner | Bearbeiter | Betrachter |
|---|---|---|---|
| Plan, Personen, Kalenderfarben sehen | ✓ | ✓ | ✓ |
| Einträge anlegen/ändern/löschen, Zuordnung ändern | ✓ | ✓ | — |
| Personen (Spalten) und Schreibweisen pflegen | ✓ | ✓ | — |
| Kalender verbinden, Adresse/Zugangsdaten eingeben | ✓ | — | — |
| Einladen, Rollen ändern, Familie umbenennen | ✓ | — | — |
| Kalenderadresse oder Zugangsdaten **lesen** | — | — | — |

Betrachter sind für Grosseltern, Betreuung oder die grossen Kinder gedacht:
Plan sehen, nichts verändern.

## Login

Gleiche Infrastruktur wie Salärli: **dasselbe Supabase-Projekt**, damit ein
bestehender Login sofort funktioniert — Anmelde-Link (Magic Link), Passwort
oder neues Konto. Getrennt sind nur die Daten: alle Tabellen dieser App heissen
`fp_*` und haben mit den Haushalts-Tabellen von Salärli nichts zu tun.

Es gibt **keinen** `auth.users`-Trigger: wer sich für Salärli registriert,
bekommt keine leere Familie, und umgekehrt. Ein angemeldeter Nutzer ohne
Familie sieht den Bildschirm „Familie anlegen“ (RPC `fp_create_family`), ein
Eingeladener öffnet einfach seinen Link (`…?invite=<token>`).

## Sicherheit: wo die Kalender-Zugangsdaten liegen

Die geheime ICS-Adresse ist ein Passwort — wer sie hat, liest den ganzen
Familienkalender, ohne Login. Deshalb verlässt sie den Server nie wieder:

1. **`fp_calendar_secrets`** (URL, Benutzer, Passwort) hat RLS aktiviert und
   **bewusst keine einzige Policy**. `anon` und `authenticated` sehen dort null
   Zeilen — auch der Owner kann sie über die API nicht lesen. Zugriff hat nur
   der `service_role`-Key (Edge Function) bzw. `security definer`-Funktionen.
2. **Schreiben** geht ausschliesslich über `fp_upsert_calendar(...)`. Die
   Funktion prüft selbst `fp_role_in(family) = 'owner'` (innerhalb von
   `security definer` greift RLS nicht) und schreibt Metadaten und Secret in
   einer Transaktion.
3. **Zurücklesen** gibt es nicht. Die Oberfläche zeigt nur
   `fp_calendars.url_preview` — Host plus letzte Zeichen, z. B.
   `calendar.google.com/…/basic.ics`. Beim Bearbeiten bedeutet ein leeres
   URL-Feld „gespeicherte Adresse behalten“.
4. **Abrufen** darf nur `family-calendar-sync`: JWT prüfen → Mitgliedschaft
   prüfen → Secret mit Service-Role lesen → abrufen. Die URL taucht weder in
   der Antwort noch im Log noch in `last_error` auf; Fehlermeldungen werden
   vorher von URLs und Hostnamen bereinigt.
5. **SSRF-Schutz.** Nur `https://` (und `webcal://`/`webcals://` → https,
   als Textersetzung *vor* dem Parsen: der `protocol`-Setter der URL-API
   weigert sich, ein Nicht-Spezial-Schema wie `webcal` auf `https` zu
   ändern, und tut es stillschweigend nicht). Localhost,
   `*.local`, private IPv4-Bereiche und IPv6-Loopback werden abgelehnt,
   dazu Timeout (15 s) und Grössenlimit (5 MB).
6. **Zugangsdaten** werden nur als HTTP-Basic-Auth über TLS gesendet und sind
   in der Oberfläche schreibgeschützt (leer lassen = unverändert).
7. **Einladungslinks** sind 64 zufällige Hex-Zeichen (zwei v4-UUIDs, ~244 Bit),
   einmal verwendbar.
   `fp_invite_info(token)` ist zwar ohne Login aufrufbar, verrät aber nur den
   Familiennamen zu einem Token, das der Aufrufer ohnehin schon hat.

Ein Betrachter kann `fp_calendar_cache.events` seiner eigenen Familie lesen —
genau dafür ist er da — aber nirgends schreiben und keine fremde Familie sehen:
jede Policy ist über `fp_role_in(family_id)` gebunden.

## Datenmodell

```
fp_families ─┬─ fp_memberships (user_id, role)        ← Zugänge
             ├─ fp_people                              ← Spalten des Planers
             ├─ fp_events ── fp_event_people           ← selbst erfasst
             ├─ fp_calendars ─┬─ fp_calendar_secrets   ← keine Policy!
             │                └─ fp_calendar_cache     ← abgerufene Termine
             ├─ fp_calendar_assignments                ← manuelle Korrekturen
             └─ fp_invites
```

Ganztägige Einträge nutzen `start_date`/`end_date` (Ende **inklusive**, wie ein
Mensch einen Planer liest), Termine mit Uhrzeit zusätzlich
`starts_at`/`ends_at`. Der Cache hält pro Kalender **eine** JSONB-Zeile mit dem
aufgelösten Zeitfenster (−92 bis +400 Tage) — der Planer liest immer ein ganzes
Fenster, der Sync schreibt es in einem Rutsch, Betrachter brauchen kein
Schreibrecht.

## Setup

```bash
npm install                        # im Repo-Root (npm workspaces)
cp config.example.js config.js     # Supabase-URL + Publishable Key eintragen
npm run dev -w @experiments/family-planner
```

Einmalig im Supabase-Dashboard nötig:

- **Auth → URL Configuration → Redirect URLs**: `https://planer.zillessen.dev/**`
- Cloudflare-Dashboard: Custom Domain `planer.zillessen.dev` auf den
  `experiments`-Worker (der Worker leitet den Host auf `_site/family-planner/`).

## Entwicklung

```bash
npm run dev        # Vite auf :8081
npm run typecheck
npm test           # vitest (reine Logik, kein Supabase nötig)
npm run build      # tsc -b && vite build → dist/
```

Getestet werden die Teile, in denen die Fehler stecken: ICS-Parser inklusive
Zeitzonen und Serienregeln, Namenserkennung, Datumsarithmetik und das
Zusammenführen beider Quellen in die Tabellenzellen sowie die Prüfung der
Kalender-URL inklusive `webcal://` und SSRF-Schutz (80 Tests).

Produktiv baut `build.sh` im Repo-Root (`bash build.sh family-planner`) und
erzeugt dabei `config.js` aus `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`.

## Vorschau-Deployments

Cloudflare baut **jeden Branch**. Der Branch-Preview serviert die App unter dem
Pfad `/family-planner/` (die Host-Umschreibung greift nur für
`planer.zillessen.dev`). Zwei Dinge dabei beachten:

- Die Datenbank wird **nicht** pro Branch deployt — Migrationen und Edge
  Function laufen erst beim Push auf `main` (oder manuell über *Actions →
  Family Planner — Supabase → Run workflow*). Fehlen sie, meldet die App beim
  Anlegen der Familie, dass `fp_create_family` fehlt.
- Anmelden per Link setzt voraus, dass die Preview-URL in Supabase unter
  Auth → Redirect URLs steht. Die Anmeldung per Passwort funktioniert auf
  jedem Host ohne zusätzliche Konfiguration.

## Deployment

- **Frontend**: Cloudflare Worker + Static Assets (siehe `wrangler.jsonc`).
  `planer.zillessen.dev` wird intern auf `/family-planner` umgeschrieben.
- **Datenbank & Edge Function**: `.github/workflows/family-planner-supabase.yml`
  bei Push auf `main`. Weil `supabase db push` die vollständige
  Migrationshistorie braucht, kopiert der Job die Migrationen beider
  Experimente in ein temporäres Projektverzeichnis und pusht von dort.

## Noch nicht umgesetzt

Bewusst vorbereitet, aber nicht gebaut — in den Einstellungen als deaktivierte
Einträge sichtbar:

- **Zurückschreiben** in den Kalender (aktuell ist die Anbindung nur lesend).
- **Office-365-/Exchange-Kalender**. Das Feld `fp_calendars.kind` kennt den Typ
  bereits; OAuth-Tokens kämen in dieselbe geschützte Secrets-Tabelle.
- Serientermine bei selbst erfassten Einträgen, Benachrichtigungen.
