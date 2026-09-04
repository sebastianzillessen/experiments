// Imported lunch menus, turned into entries in the children's columns.
//
// A week is stored once per school; who sees it is decided here. A child in
// school Monday to Wednesday gets Monday to Wednesday, and the same week can
// feed two children on different days without being imported twice.

import { MENU_COLOR } from './types.ts';
import type { MenuAssignment, MenuSource, MenuWeek, PlannerEvent } from './types.ts';

const TAG_LABELS: Record<string, string> = {
  'gluten-free': 'ohne Gluten',
  'lactose-free': 'ohne Laktose',
  seasonal: 'saisonal',
};

/** 1 = Monday … 5 = Friday. Saturday and Sunday are 6 and 0, and never match. */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "Lasagne (R) · Erbsli und Rüebli" — one line, because it sits in a cell. */
function chipTitle(dishes: { name: string }[]): string {
  return dishes.map(dish => dish.name).join(' · ');
}

/** The full list for the detail sheet, one dish per line with its markers. */
function details(dishes: { name: string; tags: string[] }[]): string {
  return dishes
    .map(dish => {
      const tags = dish.tags.map(tag => TAG_LABELS[tag] ?? tag);
      return tags.length ? `${dish.name} (${tags.join(', ')})` : dish.name;
    })
    .join('\n');
}

/**
 * Every imported day that somebody eats, as a planner entry.
 *
 * A day nobody is assigned to produces nothing: the menu is only interesting
 * next to the child it feeds.
 */
export function menuEventsToPlanner(
  weeks: MenuWeek[],
  sources: MenuSource[],
  assignments: MenuAssignment[]
): PlannerEvent[] {
  const byId = new Map(sources.map(source => [source.id, source]));
  const out: PlannerEvent[] = [];

  for (const week of weeks) {
    const source = byId.get(week.sourceId);
    if (!source || !source.enabled) continue;

    const eaters = assignments.filter(a => a.sourceId === week.sourceId);
    if (eaters.length === 0) continue;

    for (const day of week.days) {
      if (day.dishes.length === 0) continue;
      const weekday = weekdayOf(day.date);
      const personIds = eaters
        .filter(eater => eater.weekdays.includes(weekday))
        .map(eater => eater.personId);
      if (personIds.length === 0) continue;

      out.push({
        key: `menu:${week.id}:${day.date}`,
        source: 'menu',
        id: null,
        calendarId: null,
        calendarLabel: source.label,
        uid: null,
        occurrence: null,
        title: chipTitle(day.dishes),
        displayTitle: chipTitle(day.dishes),
        notes: details(day.dishes),
        allDay: true,
        startDate: day.date,
        endDate: day.date,
        startsAt: null,
        endsAt: null,
        personIds,
        color: MENU_COLOR,
        autoAssigned: false,
        repeat: null,
      });
    }
  }
  return out;
}
