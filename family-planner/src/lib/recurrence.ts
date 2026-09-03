// Recurring entries: one series, expanded for the days on screen.
//
// Most of a family plan repeats ("Kita every Friday"). So one row holds the
// rule and the planner works out the single days from it, for the 31 days on
// screen at most. An open-ended series therefore costs nothing.
//
// The rule is not expanded here. expandRule() in the ICS parser already does
// it (WEEKLY with BYDAY, INTERVAL, UNTIL, COUNT) and is well tested there.
// This file only shapes the rule for it and turns the result into entries.

import { expandRule } from '../../supabase/functions/family-calendar-sync/ics.ts';
import { addDaysToKey, dateKeyToMs, localToIso, timeValue } from './dates.ts';
import type { PlannerEvent } from './types.ts';

const DAY_MS = 86_400_000;

/** How an entry repeats. Weekly only for now, as in the migration. */
export type RepeatRule = {
  freq: 'weekly';
  /** Every nth week. 1 = every week. */
  interval: number;
  /** 0 = Sunday … 6 = Saturday, like Date#getUTCDay(). */
  weekdays: number[];
  /** Last day the series still runs. null = open ended. */
  until: string | null;
};

/** An entry someone typed in, in the shape the database holds it. */
export type ManualSeries = {
  id: string;
  title: string;
  notes: string;
  allDay: boolean;
  /** First date of the series. */
  startDate: string;
  endDate: string;
  startsAt: string | null;
  endsAt: string | null;
  personIds: string[];
  color: string;
  repeat: RepeatRule | null;
  /** Dates dropped one by one from the series. */
  exceptions: string[];
};

/** Guard against a rule that would produce far too many dates. */
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

/** Monday first: the planner starts its week there. */
function weekOrder(weekday: number): number {
  return (weekday + 6) % 7;
}

function formatDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${d}.${m}.${y}`;
}

/**
 * Every date of a series inside [from, to].
 *
 * An entry without a rule comes back as it is, as long as it touches the
 * window. That way callers need only one path.
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

  // An entry spanning several days can start before the window and reach in.
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

/** The same for every series of a family. */
export function expandManualSeries(
  all: ManualSeries[], from: string, to: string, tz: string
): PlannerEvent[] {
  return all.flatMap(series => expandSeries(series, from, to, tz));
}

function toPlannerEvent(
  series: ManualSeries, day: string, spanDays: number, tz: string, recurring: boolean
): PlannerEvent {
  const endDate = spanDays === 0 ? day : addDaysToKey(day, spanDays);

  // Times are worked out per date from the wall clock: 14:00 stays 14:00,
  // also in the week after the clocks change.
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
    // Names this one date, for when only it is changed or removed.
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
