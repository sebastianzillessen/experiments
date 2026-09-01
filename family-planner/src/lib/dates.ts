// Calendar-day arithmetic for the planner. Days are handled as "YYYY-MM-DD"
// keys throughout — a planner row is a calendar day, not an instant, so all
// arithmetic stays in UTC-midnight space and never drifts across DST.

import { addDaysToKey, dateKeyToMs, toDateKey, wallClockIn } from '../../supabase/functions/family-calendar-sync/ics.ts';

export { addDaysToKey, dateKeyToMs, toDateKey };

const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Today in the family's zone, as a day key. */
export function todayKey(tz: string, now: number = Date.now()): string {
  const w = wallClockIn(now, tz);
  return toDateKey(w.y, w.m, w.d);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: string): number {
  return new Date(dateKeyToMs(key)).getUTCDay();
}

export function isWeekend(key: string): boolean {
  const d = weekdayOf(key);
  return d === 0 || d === 6;
}

/** First day of the week containing `key`. weekStart: 1 = Monday (default). */
export function startOfWeek(key: string, weekStart = 1): string {
  const offset = (weekdayOf(key) - weekStart + 7) % 7;
  return addDaysToKey(key, -offset);
}

export function weekDays(startKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(startKey, i));
}

export function startOfMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return toDateKey(y, m, 1);
}

export function monthDays(key: string): string[] {
  const [y, m] = key.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => toDateKey(y, m, i + 1));
}

export function addMonths(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const maxDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return toDateKey(ny, nm, Math.min(d, maxDay));
}

/** ISO-8601 week number (the "KW" on the paper sheet). */
export function isoWeekNumber(key: string): number {
  const date = new Date(dateKeyToMs(key));
  // Thursday of the current ISO week decides which year/week it belongs to.
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

// --- labels -------------------------------------------------------------

/** "Mo 7.9." — the row header of the week table. */
export function dayLabel(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${WEEKDAYS_SHORT[weekdayOf(key)]} ${d}.${m}.`;
}

/** "Mo 7." — the tighter month-view variant. */
export function dayLabelShort(key: string): string {
  const d = Number(key.split('-')[2]);
  return `${WEEKDAYS_SHORT[weekdayOf(key)]} ${d}.`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "KW 37 · 7.–13. Sep 2026" */
export function weekLabel(startKey: string): string {
  const endKey = addDaysToKey(startKey, 6);
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  const short = (m: number) => MONTHS[m - 1].slice(0, 3);
  const range = sm === em && sy === ey
    ? `${sd}.–${ed}. ${short(sm)} ${sy}`
    : `${sd}. ${short(sm)} – ${ed}. ${short(em)} ${ey}`;
  return `KW ${isoWeekNumber(startKey)} · ${range}`;
}

/** "14:00" in the family's zone. */
export function timeLabel(iso: string, tz: string): string {
  const w = wallClockIn(Date.parse(iso), tz);
  return `${String(w.hh).padStart(2, '0')}:${String(w.mm).padStart(2, '0')}`;
}

/** "14:00–15:15", or "ab 14:00" when start and end are the same. */
export function timeRangeLabel(startsAt: string | null, endsAt: string | null, tz: string): string {
  if (!startsAt) return '';
  const start = timeLabel(startsAt, tz);
  if (!endsAt || endsAt === startsAt) return start;
  return `${start}–${timeLabel(endsAt, tz)}`;
}

/** "heute 07:42" / "gestern 22:10" / "31.8. 09:00" — for sync timestamps. */
export function relativeStamp(iso: string | null, tz: string, now: number = Date.now()): string {
  if (!iso) return 'noch nie';
  const key = todayKey(tz, Date.parse(iso));
  const today = todayKey(tz, now);
  const time = timeLabel(iso, tz);
  if (key === today) return `heute ${time}`;
  if (key === addDaysToKey(today, -1)) return `gestern ${time}`;
  const [, m, d] = key.split('-').map(Number);
  return `${d}.${m}. ${time}`;
}

/**
 * Local wall clock ("2026-09-08" + "14:00") → an ISO instant, so a time typed
 * in Zurich is stored as the instant a Zurich clock showed.
 */
export function localToIso(dateKey: string, time: string, tz: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(zonedToUtcMs(y, m, d, hh || 0, mm || 0, tz)).toISOString();
}

function zonedToUtcMs(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  const offset = (ms: number) => {
    const w = wallClockIn(ms, tz);
    return Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss) - Math.floor(ms / 1000) * 1000;
  };
  let utc = naive - offset(naive);
  utc = naive - offset(utc);
  return utc;
}

/** Every day key an event covers, clipped to [from, to]. */
export function daysBetween(startDate: string, endDate: string, from: string, to: string): string[] {
  const first = startDate > from ? startDate : from;
  const last = endDate < to ? endDate : to;
  if (first > last) return [];
  const out: string[] = [];
  for (let key = first; key <= last; key = addDaysToKey(key, 1)) out.push(key);
  return out;
}
