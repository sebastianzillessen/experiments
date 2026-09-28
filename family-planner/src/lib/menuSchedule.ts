// Which weeks of the lunch menu are missing and worth fetching now.
//
// The import used to be a button somebody had to remember. Any screen with
// edit rights now fetches what is missing, so the plan fills itself in from
// whichever device happens to be open.
//
// Nothing here guards against two screens doing it at once: that brake sits in
// the Edge Function, on the family, because the devices cannot see each other
// and the function is where the work is paid for. This module only answers
// "what is missing", away from timers and the network, so it can be tested.

import type { MenuSource } from './types.ts';

/** Friday, and the hour of the afternoon the school has usually published. */
const NEXT_WEEK_WEEKDAY = 5;
const NEXT_WEEK_HOUR = 13;

const DAY_MS = 86_400_000;

export type DueImport = { sourceId: string; year: number; week: number };

/** Identifies one week of one source. */
export function weekKey(due: DueImport): string {
  return `${due.sourceId}|${due.year}|${due.week}`;
}

type Clock = { date: string; weekday: number; hour: number };

/** Wall clock in the family's zone: the date, ISO weekday (Mon = 1), and hour. */
export function wallClock(nowMs: number, timeZone: string): Clock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date(nowMs));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: days.indexOf(get('weekday')) + 1,
    hour: Number(get('hour')),
  };
}

/** The ISO year and week a date falls in. */
export function isoWeekOf(dateKey: string): { year: number; week: number } {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = Date.UTC(y, m - 1, d);
  const weekday = (new Date(date).getUTCDay() + 6) % 7;
  const thursday = date + (3 - weekday) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Weekday = (new Date(jan4).getUTCDay() + 6) % 7;
  const week1Monday = jan4 - jan4Weekday * DAY_MS;
  return { year, week: Math.round((thursday - week1Monday) / (7 * DAY_MS)) + 1 };
}

/**
 * What is missing right now — usually nothing.
 *
 * The current week counts at any moment: a source added on a Tuesday should
 * fill in on that Tuesday, not wait for the weekend. The coming week only
 * counts from Friday afternoon, because before that the school has not
 * published it and asking is pure noise against their server.
 */
export function dueMenuImports(input: {
  nowMs: number;
  timeZone: string;
  sources: MenuSource[];
  weeks: { sourceId: string; year: number; week: number }[];
}): DueImport[] {
  const { nowMs, timeZone, sources, weeks } = input;
  const now = wallClock(nowMs, timeZone);

  const wanted = [isoWeekOf(now.date)];
  const afternoon = now.weekday > NEXT_WEEK_WEEKDAY
    || (now.weekday === NEXT_WEEK_WEEKDAY && now.hour >= NEXT_WEEK_HOUR);
  if (afternoon) wanted.push(isoWeekOf(addDays(now.date, 7)));

  const stored = new Set(weeks.map(w => `${w.sourceId}|${w.year}|${w.week}`));
  const enabled = sources.filter(source => source.enabled);

  // The current week first: a plan for today beats a plan for Monday.
  return wanted
    .flatMap(({ year, week }) => enabled.map(source => ({ sourceId: source.id, year, week })))
    .filter(due => !stored.has(weekKey(due)));
}

/** yyyy-mm-dd, n days on. */
function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}
