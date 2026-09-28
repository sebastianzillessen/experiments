// When the wall tablet should fetch next week's lunch menu by itself.
//
// The import is a button in the settings, which means somebody has to remember
// it. The screen in the kitchen is on anyway, so it does the remembering: from
// Friday afternoon it pulls the coming week for every source that has not been
// fetched yet.
//
// Only the kiosk screen runs this, which is what makes it safe: one device, so
// two tablets cannot both pay for the same import. Deciding *what* is due is
// kept here, away from timers and the network, so it can be tested.

import type { MenuSource } from './types.ts';

/** Friday, and the hour of the afternoon the school has usually published. */
const DUE_WEEKDAY = 5;
const DUE_HOUR = 13;
/** A PDF that is not up yet is the normal case, so asking again is cheap-ish
 *  but not free: every attempt reads the file and costs a model call. */
const RETRY_AFTER_MS = 60 * 60_000;

const DAY_MS = 86_400_000;

export type DueImport = { sourceId: string; year: number; week: number };

/** The key an attempt is remembered under. */
export function attemptKey(due: DueImport): string {
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
 * What the tablet should fetch right now — usually nothing.
 *
 * `weeks` is what is already stored, `attempts` when each was last tried, so a
 * source whose PDF is not published yet is retried rather than hammered.
 */
export function dueMenuImports(input: {
  nowMs: number;
  timeZone: string;
  sources: MenuSource[];
  weeks: { sourceId: string; year: number; week: number }[];
  attempts: Record<string, number>;
  retryAfterMs?: number;
}): DueImport[] {
  const { nowMs, timeZone, sources, weeks, attempts } = input;
  const retryAfter = input.retryAfterMs ?? RETRY_AFTER_MS;

  const now = wallClock(nowMs, timeZone);
  if (now.weekday < DUE_WEEKDAY) return [];
  if (now.weekday === DUE_WEEKDAY && now.hour < DUE_HOUR) return [];

  // The week that starts on Monday. From Monday to Thursday this would be the
  // week after the one on screen, which nobody is asking for yet — hence the
  // weekday gate above.
  const [y, m, d] = now.date.split('-').map(Number);
  const target = isoWeekOf(new Date(Date.UTC(y, m - 1, d) + 7 * DAY_MS).toISOString().slice(0, 10));

  const stored = new Set(weeks.map(w => `${w.sourceId}|${w.year}|${w.week}`));

  return sources
    .filter(source => source.enabled)
    .map(source => ({ sourceId: source.id, year: target.year, week: target.week }))
    .filter(due => !stored.has(attemptKey(due)))
    .filter(due => nowMs - (attempts[attemptKey(due)] ?? 0) >= retryAfter);
}
