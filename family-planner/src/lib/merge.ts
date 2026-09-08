// Turn the two sources — manually planned entries and cached calendar
// occurrences — into one list of planner events, then into the cells of the
// day × person table.

import { autoAssign, stripPeopleNames } from './assign.ts';
import { daysBetween, timeValue } from './dates.ts';
import { stripRedundantTime } from './parseTitleTime.ts';
import { wallClockIn } from '../../supabase/functions/family-calendar-sync/ics.ts';
import { FAMILY_COLUMN } from './types.ts';
import type { Assignment, CachedEvent, Calendar, Person, PlannerEvent } from './types.ts';

/** Key of a manual override: one occurrence of one calendar event. */
export function assignmentKey(calendarId: string, uid: string, occurrence: string | null): string {
  return `${calendarId}|${uid}|${occurrence ?? ''}`;
}

export type CalendarCacheEntry = {
  calendarId: string;
  events: CachedEvent[];
};

/**
 * Cached calendar events → planner events, with names matched to people and
 * manual overrides applied. Hidden events drop out entirely.
 */
export function calendarEventsToPlanner(
  caches: CalendarCacheEntry[],
  calendars: Calendar[],
  people: Person[],
  assignments: Assignment[],
  tz = 'Europe/Zurich'
): PlannerEvent[] {
  const byId = new Map(calendars.map(c => [c.id, c]));
  const overrides = new Map<string, Assignment>();
  for (const a of assignments) {
    overrides.set(assignmentKey(a.calendarId, a.uid, a.occurrence), a);
  }

  const out: PlannerEvent[] = [];
  for (const cache of caches) {
    const calendar = byId.get(cache.calendarId);
    if (!calendar || !calendar.enabled) continue;

    for (const event of cache.events) {
      // A per-occurrence override wins over one for the whole series.
      const override = overrides.get(assignmentKey(cache.calendarId, event.uid, event.occurrence))
        ?? overrides.get(assignmentKey(cache.calendarId, event.uid, null));
      if (override?.hidden) continue;

      const personIds = override ? override.personIds : autoAssign(event, people);
      const assigned = people.filter(p => personIds.includes(p.id));
      const title = event.title || '(ohne Titel)';
      out.push({
        key: `cal:${cache.calendarId}:${event.uid}:${event.occurrence}`,
        source: 'calendar',
        id: null,
        calendarId: cache.calendarId,
        calendarLabel: calendar.label,
        uid: event.uid,
        occurrence: event.occurrence,
        title,
        // The column says who it is for and the chip already shows the time,
        // so neither has to be repeated in the text.
        displayTitle: stripPeopleNames(
          stripRedundantTime(
            title,
            event.startsAt ? timeValue(event.startsAt, tz) : null,
            event.endsAt ? timeValue(event.endsAt, tz) : null,
          ),
          assigned,
        ),
        notes: event.description || '',
        allDay: event.allDay,
        startDate: event.startDate,
        endDate: event.endDate,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        personIds,
        color: calendar.color,
        autoAssigned: !override,
        // Series from a calendar arrive already expanded.
        repeat: null,
      });
    }
  }
  return out;
}

/**
 * The table body: dayKey → columnId → events, sorted the way the eye reads a
 * planner cell (timed entries by clock, all-day entries first).
 */
export function buildCells(
  days: string[],
  people: Person[],
  events: PlannerEvent[],
  tz = 'Europe/Zurich'
): Map<string, Map<string, PlannerEvent[]>> {
  const from = days[0];
  const to = days[days.length - 1];
  const columns = [...people.map(p => p.id), FAMILY_COLUMN];

  const cells = new Map<string, Map<string, PlannerEvent[]>>();
  for (const day of days) {
    const row = new Map<string, PlannerEvent[]>();
    for (const column of columns) row.set(column, []);
    cells.set(day, row);
  }
  if (!from || !to) return cells;

  const known = new Set(people.map(p => p.id));
  for (const event of events) {
    // A person that was archived or deleted must not vanish from the plan —
    // its entries fall back into the shared column.
    const targets = event.personIds.filter(id => known.has(id));
    const columnIds = targets.length ? targets : [FAMILY_COLUMN];
    for (const day of daysBetween(event.startDate, event.endDate, from, to)) {
      const row = cells.get(day);
      if (!row) continue;
      for (const column of columnIds) row.get(column)?.push(event);
    }
  }

  // Sort by the time printed on the chip, not by the absolute instant. An
  // entry across midnight (18:00-6:00) starts on the day before, so on the
  // next day it would otherwise sort ahead of everything else even though it
  // reads "18:00".
  const startMinutes = new Map<string, number>();
  for (const event of events) {
    if (event.allDay || !event.startsAt) continue;
    const clock = wallClockIn(Date.parse(event.startsAt), tz);
    startMinutes.set(event.key, clock.hh * 60 + clock.mm);
  }

  for (const row of cells.values()) {
    for (const list of row.values()) {
      list.sort((a, b) => compareEvents(a, b, startMinutes));
    }
  }
  return cells;
}

/**
 * All-day entries first, then by the start time on the chip, then by title.
 * `startMinutes` holds minutes since midnight per entry. Without that map the
 * absolute instant is compared instead, for callers that know no time zone.
 */
export function compareEvents(
  a: PlannerEvent, b: PlannerEvent, startMinutes?: Map<string, number>
): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;

  if (startMinutes) {
    const aStart = startMinutes.get(a.key);
    const bStart = startMinutes.get(b.key);
    if (aStart !== undefined && bStart !== undefined && aStart !== bStart) {
      return aStart - bStart;
    }
  } else if (a.startsAt && b.startsAt && a.startsAt !== b.startsAt) {
    return a.startsAt < b.startsAt ? -1 : 1;
  }

  return a.title.localeCompare(b.title, 'de');
}

/** True when the entry spans more than the day it is rendered in. */
export function isMultiDay(event: PlannerEvent): boolean {
  return event.endDate > event.startDate;
}

/**
 * One day of a multi-day entry, drawn as a band beside the cells.
 *
 * The table puts days in rows and people in columns, so an entry that runs
 * over several days is one tall object in a column — a week of holidays is a
 * single thing, not seven identical chips. `first` and `last` are about the
 * days on screen, not the entry: a holiday that started last week is still
 * labelled on Monday, with `openStart` saying the band was already running.
 */
export type SpanLane = {
  event: PlannerEvent;
  first: boolean;
  last: boolean;
  openStart: boolean;
  openEnd: boolean;
};

export type SpanTable = {
  /** Bands a column needs, so every cell in it keeps the same room free. */
  lanes: Map<string, number>;
  /** column → day → one slot per lane, null where that lane runs nothing. */
  at: Map<string, Map<string, (SpanLane | null)[]>>;
  /** Entry key → the day its chip belongs on, for entries drawn as a band. */
  spannedFrom: Map<string, string>;
};

const EMPTY_SPANS: SpanTable = { lanes: new Map(), at: new Map(), spannedFrom: new Map() };

/**
 * Lay the multi-day entries out in lanes, per column.
 *
 * An entry keeps one lane for its whole run, so a band never steps sideways
 * halfway down. Longest first, so the week-long band sits innermost and the
 * short ones stack outside it rather than pushing it about.
 */
export function buildSpanLanes(
  days: string[],
  people: Person[],
  events: PlannerEvent[]
): SpanTable {
  const from = days[0];
  const to = days[days.length - 1];
  if (!from || !to) return EMPTY_SPANS;

  const known = new Set(people.map(p => p.id));
  const runs = new Map<string, { event: PlannerEvent; run: string[] }[]>();
  const spannedFrom = new Map<string, string>();

  for (const event of events) {
    if (!isMultiDay(event)) continue;
    const run = daysBetween(event.startDate, event.endDate, from, to);
    // One day on screen is an ordinary entry, whatever it does off screen.
    if (run.length < 2) continue;
    spannedFrom.set(event.key, run[0]);
    const targets = event.personIds.filter(id => known.has(id));
    for (const column of targets.length ? targets : [FAMILY_COLUMN]) {
      const list = runs.get(column) ?? [];
      list.push({ event, run });
      runs.set(column, list);
    }
  }

  const lanes = new Map<string, number>();
  const at = new Map<string, Map<string, (SpanLane | null)[]>>();

  for (const [column, list] of runs) {
    list.sort((a, b) => b.run.length - a.run.length
      || a.run[0].localeCompare(b.run[0])
      || a.event.title.localeCompare(b.event.title, 'de'));

    const perDay = new Map<string, (SpanLane | null)[]>();
    for (const day of days) perDay.set(day, []);

    let count = 0;
    for (const { event, run } of list) {
      let lane = 0;
      while (run.some(day => perDay.get(day)![lane])) lane++;
      count = Math.max(count, lane + 1);
      run.forEach((day, i) => {
        const slots = perDay.get(day)!;
        while (slots.length <= lane) slots.push(null);
        slots[lane] = {
          event,
          first: i === 0,
          last: i === run.length - 1,
          openStart: i === 0 && event.startDate < from,
          openEnd: i === run.length - 1 && event.endDate > to,
        };
      });
    }

    // A lane is held open only while a band still runs outside it: lane 1
    // occupied means lane 0 must keep its place even when empty, but a day
    // with nothing after lane 0 gives the width back to the entries.
    for (const [day, slots] of perDay) {
      while (slots.length && !slots[slots.length - 1]) slots.pop();
      perDay.set(day, slots);
    }
    lanes.set(column, count);
    at.set(column, perDay);
  }

  return { lanes, at, spannedFrom };
}
