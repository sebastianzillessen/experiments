# Wer macht was — household work tracker (UI proposal)

Which jobs keep the house running, how often they really happen, how long they
take — and who did them. A clickable prototype of the entry screens, meant as
the design basis for something that later moves into the
[Familienplaner](../family-planner).

> **This was the proposal; the feature itself now lives in the planner.** It is
> built in [`../family-planner`](../family-planner) — Supabase-backed, shared
> between phones, people taken from the family. This folder stays as the
> design sketch it was, and is not kept in step with it.

Single HTML file, no build, no backend. Open `index.html` in a browser.

The interface is German; code and comments are English. It borrows the
Familienplaner's tokens (warm paper, `--accent` green, Source Sans 3) so the
two look like one product, and adds IBM Plex Mono for the numbers.

## The three screens

- **Heute** — the daily driver. Every task that is due, one tap on **C** or
  **B** and it is logged with the person, the time and the duration. A toast
  offers *Rückgängig*. Tasks with a daily rhythm show one pip per expected run
  (`C · ·` = one of three walks done, by Caro), so nobody has to remember
  whether the dog already went out.
- **Aufgaben** — the catalog, grouped by area, with the weekly load per area
  and per task. Tapping a task opens the entry sheet.
- **Verteilung** — the point of the whole thing: minutes per week split
  between Caro and Basti, overall and per area, plus the biggest single items.

## What a task carries

| Field | Why |
| --- | --- |
| Name, Bereich | Haushalt, Tiere, Entsorgung, Kinder, Garten, Airbnb |
| Rhythmus | one of three kinds, see below |
| Dauer | minutes per run — the basis for every load figure |
| Wer normalerweise | Caro / Basti / Beide / Wechselnd |
| Einzeln erfassen | each run logged separately (dog walks), not ticked off once a day |
| Dauer jedes Mal erfassen | ask for the minutes on every log — for jobs that swing |
| Koordination | the job is mostly remembering and organising (Airbnb cleaning, the weekly order) |
| Aktiv | keeps seasonal jobs in the catalog without cluttering *Heute* |

Three rhythm kinds cover the list without forcing anything into a weekly grid:

1. **Fester Takt** — *2–3× pro Tag*, *1–2× pro Woche*, optionally pinned to
   weekdays (Kita on Fridays).
2. **Alle X Wochen** — *alle 6 Wochen* for the cat food order, *alle 2 Wochen*
   for the lawn.
3. **Bei Ereignis** — *nach jedem Gast*. Never marked overdue; it carries an
   estimate per week so it still counts toward the load.

## How long did it take?

Durations swing: hanging up one load of bedding is 5 minutes, a load of
children's underwear is 20. Three ways in, by how much the job varies:

1. **Straight through.** Tapping a person logs the job with its usual value.
   The toast that follows carries **− 12 min +**, so a correction costs one
   more tap and nothing had to be decided up front.
2. **Zeit zusammentippen.** Tasks with *Dauer jedes Mal erfassen* switched on
   open a sheet that starts at zero with three blocks: **+5 min**, **+15 min**,
   **+1 h**. Tapping adds up — 15 + 5 + 5 = 25 min — and *Zurücksetzen* starts
   over. No keyboard, no stepper held down, works with one thumb.
3. **Stoppuhr.** Same sheet, *Stoppuhr statt tippen*: a bar stays at the top of
   every screen while it runs, *Fertig* logs the measured minutes. It survives
   a reload, so the phone can go back in the pocket.

Whatever the route, the task's own history is what the lists show: once four
entries exist, the row reads `Ø 12 min (5–20)` instead of a single guess, and
the median — not the estimate — is what a quick log uses.

## Measured vs. planned

Every log feeds back into the task. The entry sheet shows what actually
happened — *Gemessen aus 65 Einträgen: 16,3×/Woche · Ø 25 min* — with one
button to adopt those values. In the lists a task whose measured rate drifts
more than 30 % from the plan gets a `gemessen 1,5×/Wo` chip, so the catalog
corrects itself instead of slowly going stale.

## Example data

It opens filled with the ~20 jobs Caro and Basti named, plus four weeks of
generated history, marked *Beispieldaten*. Changes are kept in `localStorage`;
*Beispieldaten zurücksetzen* on the Verteilung screen rebuilds them.

## Open questions for the real version

- Shared state: two phones need the same data — Supabase, like the planner.
- Login: reuse the Familienplaner's family account instead of a separate one.
- Does *Koordination* get its own weight in the split, or only its own label?
- Should the planning figure follow the measured median on its own, or keep
  asking before it changes?
