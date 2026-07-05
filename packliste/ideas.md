# Packliste — Feature-Ideen

Ideensammlung für die Packlisten-App. ⚡ = kleiner, schneller Gewinn.

## 🚀 Ausgewählte Roadmap (als Nächstes umsetzen)

| # | Feature | Status |
|---|---------|--------|
| 1 | Push-Erinnerungen (Trip-Reminder) | ✅ client-seitig (Background-Push offen) |
| 2 | Template-Deduplizierung | ✅ erledigt |
| 3 | Trip-Item-Deduplizierung | ✅ erledigt |
| 4 | Import aus Liste in der Omnibox (eine Zeile = ein Item) | ✅ erledigt |
| 5 | Wetter-basierte Item-Vorschläge | ✅ erledigt |

Kurznotizen zur Umsetzung:

- **Push-Erinnerungen** — Notification-Permission + Erinnerung X Tage vor Abreise.
  Echtes Background-Push braucht Server (VAPID + Push-Service; der Cloudflare-Worker
  könnte das übernehmen). Client-seitig als lokale/geplante Notification + In-App-Banner
  starten.
- **Template-Deduplizierung** — im Vorlage-Tab nahe Duplikate (Fuzzy-Name) finden und
  zum Zusammenführen anbieten. Nutzt `fuzzyIncludes`/`levenshtein` aus `derive.ts`.
- **Trip-Item-Deduplizierung** — im Trip Duplikate (gleicher Name + Person, fuzzy)
  erkennen; zusammenführen (Menge addieren) oder entfernen.
- **Import aus Liste** — Mehrzeilige Eingabe/Paste in der Omnibox: jede Zeile via
  `parseOmni` (Menge, @Person, Name) → Sammel-Import.
- **Wetter-Item-Vorschläge** — `recommendConditions` liefert sun/rain/cold; daraus
  konkrete Items (Sonnencreme, Regenjacke, Winterkleidung) ableiten und per Tap
  hinzufügen; bereits vorhandene überspringen.

---

## Packing-Workflow

- ⚡ **Bulk-Aktionen** — „alle einpacken" / „zurücksetzen" pro Kategorie oder Person(en)-Spalte.
- ⚡ **Item-Notizen** — kurze Freitext-Zeile pro Item („Ladekabel = USB-C").
- **Gepäck-/Taschen-Gruppierung** — zweite Achse neben Person/Kategorie: welcher Koffer/Rucksack.
- **Gewicht** — optional Gramm pro Item → Live-Summe pro Tasche vs. Airline-Limit.
- **Rückreise-Checkliste** — Liste in „wieder einpacken"-Modus für den Heimweg.
- **Foto pro Item/Tasche** — visuelle Bestätigung.

## Smart / Automation

- **Wetter-Vorschläge** (Roadmap #5) — Vorhersage ist verdrahtet; in konkrete Item-Tipps übersetzen.
- **„Etwas vergessen?"** — aktuellen Trip gegen frühere Trips gleicher Bedingungen vergleichen.
- **Wäsche-Planer** — die vorhandene Waschintervall-Rechnung sichtbar machen (Tag 3, 6 …).
- ⚡ **Template-Dedupe** (Roadmap #2) — nahe Duplikate per Fuzzy-Matcher melden.

## Zusammenarbeit (Auth aktuell gemockt)

- **Echte Accounts + Live-Sync** — statt 6-stelligem KV-Code echter Familien-Cloud-Sync + Präsenz.
- **Verantwortung zuweisen** — „wer packt was"; gefilterte Sicht pro Mitglied (passt zum Board-DnD).
- ⚡ **Einladungs-Link** — statt Sync-Code abtippen.
- **Push-Erinnerungen** (Roadmap #1) — „Abreise in 2 Tagen — 8 Dinge offen".

## Trip-Planung

- **Trips-Übersicht / Kalender** — kommende Trips, Countdown, Schnell-Duplizieren.
- **Reiseplan → Bedingungen** — Aktivitätstage („Wandertag") aktivieren passende Bedingung + Ausrüstung.
- **Ziel-Infos** — Steckertyp, Währung, Spannung pro Ziel (`destination` existiert bereits).
- ⚡ **Wiederkehrende/duplizierte Trips** — `duplicateTrip` als „wie letztes Jahr" anbieten.

## Kinder & Haustiere (`isPet` existiert bereits)

- **Kinder-Modus** — große Checkboxen, eigene Spalte pro Kind, kleine Belohnung.
- ⚡ **Haustier-Vorlagen** — `isPet` ist modelliert, aber ungenutzt; haustier-spezifische Default-Items.

## Daten, Export & Politur

- ⚡ **Liste als Text / WhatsApp teilen** — Klartext-Export einer Personen-Liste.
- ⚡ **Dark Mode** — Theme ist in `theme.yak.ts` zentralisiert → zweite Palette.
- **Import aus Text** (Roadmap #4) — Liste einfügen, in Items parsen.
- **Trip-Statistiken** — „du vergisst fast immer die Ladekabel"; Hinweise aus der Historie.
- ⚡ **Desktop-Tastenkürzel** — `j/k` bewegen, `space` packen, Pfeile zwischen Spalten.
- **Reihenfolge innerhalb einer Kategorie** per Drag ändern (Board ändert aktuell nur Person/Kategorie).
- **Trip-Item-Dedupe** (Roadmap #3) — Duplikate im Trip zusammenführen.
