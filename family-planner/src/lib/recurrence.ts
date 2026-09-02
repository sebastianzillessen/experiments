// Wiederkehrende Einträge: eine Serie, aufgelöst für den sichtbaren Zeitraum.
//
// Ein Familienplan besteht grösstenteils aus Wiederholungen ("Kita jeden
// Freitag"), also trägt eine Zeile die Regel und der Planer rechnet daraus die
// einzelnen Tage aus — nur für die höchstens 31 Tage, die gerade auf dem
// Schirm sind. Eine offene Serie kostet damit nichts.
//
// Die Regel selbst wird NICHT hier ausgerechnet: expandRule() aus dem
// ICS-Parser kann das längst (WEEKLY mit BYDAY, INTERVAL, UNTIL, COUNT) und
// ist dort ausführlich getestet. Hier wird nur die Regel in seine Form
// gebracht und das Ergebnis in Planer-Einträge übersetzt.

import { expandRule } from '../../supabase/functions/family-calendar-sync/ics.ts';
import { addDaysToKey, dateKeyToMs, localToIso, timeValue } from './dates.ts';
import type { PlannerEvent } from './types.ts';

const DAY_MS = 86_400_000;

/** Was wiederholt wird. Heute nur wöchentlich — siehe Migration. */
export type RepeatRule = {
  freq: 'weekly';
  /** Jede n-te Woche. 1 = jede Woche. */
  interval: number;
  /** 0 = Sonntag … 6 = Samstag, wie Date#getUTCDay(). */
  weekdays: number[];
  /** Letzter Tag, an dem die Serie noch stattfindet. null = offen. */
  until: string | null;
};

/** Ein selbst erfasster Eintrag, so wie er in der Datenbank steht. */
export type ManualSeries = {
  id: string;
  title: string;
  notes: string;
  allDay: boolean;
  /** Erster Termin der Serie. */
  startDate: string;
  endDate: string;
  startsAt: string | null;
  endsAt: string | null;
  personIds: string[];
  color: string;
  repeat: RepeatRule | null;
  /** Einzeln entfernte Termine (Datum des jeweiligen Vorkommens). */
  exceptions: string[];
};

/** Sicherung gegen eine Regel, die zu viele Termine erzeugen würde. */
const MAX_OCCURRENCES = 400;

const WEEKDAY_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** "wöchentlich Fr" / "alle 2 Wochen Mo, Do" / "wöchentlich Fr, bis 10.7.2027" */
export function describeRepeat(rule: RepeatRule): string {
  const days = [...rule.weekdays].sort((a, b) => weekOrder(a) - weekOrder(b))
    .map(d => WEEKDAY_LABELS[d]).join(', ');
  const every = rule.interval === 1 ? 'wöchentlich' : `alle ${rule.interval} Wochen`;
  const until = rule.until ? `, bis ${formatDay(rule.until)}` : '';
  return `${every} ${days}${until}`;
}

/** Montag zuerst — der Planer beginnt die Woche am Montag. */
function weekOrder(weekday: number): number {
  return (weekday + 6) % 7;
}

function formatDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${d}.${m}.${y}`;
}

/**
 * Alle Termine einer Serie im Fenster [from, to].
 *
 * Ein Eintrag ohne Regel kommt unverändert zurück (sofern er das Fenster
 * berührt), damit der Aufrufer nicht zwei Wege kennen muss.
 */
export function expandSeries(
  series: ManualSeries, from: string, to: string, tz: string
): PlannerEvent[] {
  const spanDays = Math.max(
    0, Math.round((dateKeyToMs(series.endDate) - dateKeyToMs(series.startDate)) / DAY_MS)
  );

  if (!series.repeat) {
    if (series.endDate < from || series.startDate > to) return [];
    return [toPlannerEvent(series, series.startDate, spanDays, tz, false)];
  }

  // Ein mehrtägiger Termin, der vor dem Fenster beginnt, reicht noch hinein.
  const searchFrom = addDaysToKey(from, -Math.min(spanDays, 60));
  const rule = {
    freq: 'WEEKLY',
    interval: Math.max(1, series.repeat.interval),
    count: null,
    untilKey: series.repeat.until,
    byDay: series.repeat.weekdays.map(weekday => ({ ordinal: null, weekday })),
    byMonthDay: [],
    byMonth: [],
  };

  const skipped = new Set(series.exceptions);
  const out: PlannerEvent[] = [];
  for (const day of expandRule(series.startDate, rule, searchFrom, to, MAX_OCCURRENCES)) {
    if (skipped.has(day)) continue;
    out.push(toPlannerEvent(series, day, spanDays, tz, true));
  }
  return out;
}

/** Dasselbe für alle Serien einer Familie. */
export function expandManualSeries(
  all: ManualSeries[], from: string, to: string, tz: string
): PlannerEvent[] {
  return all.flatMap(series => expandSeries(series, from, to, tz));
}

function toPlannerEvent(
  series: ManualSeries, day: string, spanDays: number, tz: string, recurring: boolean
): PlannerEvent {
  const endDate = spanDays === 0 ? day : addDaysToKey(day, spanDays);

  // Uhrzeiten werden pro Termin aus der Wandzeit neu gerechnet: 14:00 bleibt
  // 14:00, auch in der Woche nach der Zeitumstellung.
  let startsAt: string | null = null;
  let endsAt: string | null = null;
  if (!series.allDay && series.startsAt && series.endsAt) {
    startsAt = localToIso(day, timeValue(series.startsAt, tz), tz);
    endsAt = localToIso(endDate, timeValue(series.endsAt, tz), tz);
  }

  return {
    key: recurring ? `man:${series.id}:${day}` : `man:${series.id}`,
    source: 'manual',
    id: series.id,
    calendarId: null,
    calendarLabel: null,
    uid: null,
    // Adressiert genau diesen Termin, wenn nur er geändert oder entfernt wird.
    occurrence: recurring ? day : null,
    title: series.title,
    displayTitle: series.title,
    notes: series.notes,
    allDay: series.allDay,
    startDate: day,
    endDate,
    startsAt,
    endsAt,
    personIds: series.personIds,
    color: series.color,
    autoAssigned: false,
    repeat: series.repeat,
  };
}
