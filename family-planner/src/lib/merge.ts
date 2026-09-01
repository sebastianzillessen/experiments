// Turn the two sources — manually planned entries and cached calendar
// occurrences — into one list of planner events, then into the cells of the
// day × person table.

import { autoAssign } from './assign.ts';
import { daysBetween } from './dates.ts';
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
  assignments: Assignment[]
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
      out.push({
        key: `cal:${cache.calendarId}:${event.uid}:${event.occurrence}`,
        source: 'calendar',
        id: null,
        calendarId: cache.calendarId,
        calendarLabel: calendar.label,
        uid: event.uid,
        occurrence: event.occurrence,
        title: event.title || '(ohne Titel)',
        notes: event.description || '',
        allDay: event.allDay,
        startDate: event.startDate,
        endDate: event.endDate,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        personIds,
        color: calendar.color,
        autoAssigned: !override,
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
  events: PlannerEvent[]
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

  for (const row of cells.values()) {
    for (const list of row.values()) list.sort(compareEvents);
  }
  return cells;
}

export function compareEvents(a: PlannerEvent, b: PlannerEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.startsAt && b.startsAt && a.startsAt !== b.startsAt) {
    return a.startsAt < b.startsAt ? -1 : 1;
  }
  return a.title.localeCompare(b.title, 'de');
}

/** True when the entry spans more than the day it is rendered in. */
export function isMultiDay(event: PlannerEvent): boolean {
  return event.endDate > event.startDate;
}
