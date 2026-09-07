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
