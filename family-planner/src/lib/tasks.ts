// Household work: the arithmetic between a task's rhythm and its logs.
//
// Everything here is pure, so the screen can stay about buttons. The rule the
// whole file follows: the rhythm is what the family *means* to do, the logs are
// what happened, and the two are shown next to each other rather than one
// quietly overwriting the other.

import { addDaysToKey, todayKey, weekdayOf } from './dates.ts';
import type { HouseholdTask, TaskLog } from './types.ts';

const DAY_MS = 86_400_000;
const UNIT_DAYS: Record<string, number> = { tage: 1, wochen: 7, monate: 30.4 };

/** 1 = Monday … 7 = Sunday, the count fp_tasks.weekdays uses. */
export const WEEKDAYS = [
  { n: 1, label: 'Mo' }, { n: 2, label: 'Di' }, { n: 3, label: 'Mi' }, { n: 4, label: 'Do' },
  { n: 5, label: 'Fr' }, { n: 6, label: 'Sa' }, { n: 7, label: 'So' },
];

export function weekdayNumber(key: string): number {
  const d = weekdayOf(key);
  return d === 0 ? 7 : d;
}

/* ------------------------------------------------------------- planning */

/** How often the task is meant to happen, per week. */
export function plannedPerWeek(task: HouseholdTask): number {
  const r = task.rhythm;
  if (r.kind === 'takt') {
    const avg = (r.min + (r.max || r.min)) / 2;
    if (r.per === 'tag') return avg * 7;
    if (r.per === 'monat') return avg / 4.345;
    return avg;
  }
  if (r.kind === 'intervall') return 7 / Math.max(1, r.every * (UNIT_DAYS[r.unit] ?? 7));
  if (r.kind === 'ereignis') return Math.max(0, r.estPerWeek);
  // A list of days is its own rate: what it actually asks for in the eight
  // weeks around today, which is the window a list like that usually covers.
  return datesAround(task, 28).length / 8;
}

/** The planned days within `days` either side of today. */
function datesAround(task: HouseholdTask, days: number, now: number = Date.now()): string[] {
  const from = new Date(now - days * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now + days * 86_400_000).toISOString().slice(0, 10);
  return task.dates.map(d => d.date).filter(d => d >= from && d <= to);
}

/** The next planned day from today, for a task that has a list. */
export function nextDate(task: HouseholdTask, tz: string, now: number = Date.now()): string | null {
  const today = todayKey(tz, now);
  return task.dates.map(d => d.date).filter(d => d >= today).sort()[0] ?? null;
}

/** "Sa, 3. Okt." — short enough to sit in a row of metadata. */
export function dateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const short = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const month = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'][m - 1];
  return `${short}, ${d}. ${month}`;
}

/** Planned minutes per week — the figure the distribution is budgeted on. */
export function weeklyMinutes(task: HouseholdTask): number {
  return plannedPerWeek(task) * task.minutes;
}

/** How many runs a day expects, or null when the task has no daily rhythm. */
export function dailyTarget(task: HouseholdTask): { min: number; max: number } | null {
  const r = task.rhythm;
  if (r.kind !== 'takt' || r.per !== 'tag') return null;
  return { min: r.min, max: r.max || r.min };
}

export function rhythmLabel(task: HouseholdTask, today?: string): string {
  const r = task.rhythm;
  if (r.kind === 'intervall') return `alle ${r.every} ${r.unit === 'tage' ? 'Tage' : r.unit === 'monate' ? 'Monate' : 'Wochen'}`;
  if (r.kind === 'ereignis') return r.trigger.trim() || 'bei Bedarf';
  if (r.kind === 'termine') {
    const from = today ?? new Date().toISOString().slice(0, 10);
    const open = task.dates.filter(d => d.date >= from).length;
    return open ? `feste Termine (${open} offen)` : 'feste Termine';
  }
  const count = r.max && r.max !== r.min ? `${r.min}–${r.max}` : String(r.min);
  const per = r.per === 'tag' ? 'Tag' : r.per === 'monat' ? 'Monat' : 'Woche';
  const days = task.weekdays.length
    ? ` (${task.weekdays.slice().sort((a, b) => a - b).map(n => WEEKDAYS[n - 1]?.label).join(', ')})`
    : '';
  return `${count}× pro ${per}${days}`;
}

/* ------------------------------------------------------------- measured */

export function logsOf(logs: TaskLog[], taskId: string): TaskLog[] {
  return logs.filter(l => l.taskId === taskId);
}

/** What actually happened, per week, over the window the lists compare against. */
export function measuredPerWeek(
  logs: TaskLog[], taskId: string, now: number = Date.now(), days = 28
): number {
  const from = now - days * DAY_MS;
  const n = logs.filter(l => l.taskId === taskId && Date.parse(l.doneAt) >= from).length;
  return n / (days / 7);
}

export type DurationStats = { n: number; min: number; median: number; max: number };

/** The spread of how long it took, which for many jobs is the whole story. */
export function durationStats(logs: TaskLog[], taskId: string): DurationStats | null {
  const v = logsOf(logs, taskId).map(l => l.minutes).sort((a, b) => a - b);
  if (!v.length) return null;
  return { n: v.length, min: v[0], median: v[Math.floor(v.length / 2)], max: v[v.length - 1] };
}

/** What a quick log should book: the measured middle, or the estimate. */
export function defaultMinutes(task: HouseholdTask, logs: TaskLog[]): number {
  const stats = durationStats(logs, task.id);
  return stats && stats.n >= 3 ? stats.median : task.minutes;
}

export function lastLog(logs: TaskLog[], taskId: string): TaskLog | null {
  let best: TaskLog | null = null;
  for (const l of logs) {
    if (l.taskId === taskId) if (!best || l.doneAt > best.doneAt) best = l;
  }
  return best;
}

export function logsOnDay(logs: TaskLog[], taskId: string, dayKey: string, tz: string): TaskLog[] {
  return logs.filter(l => l.taskId === taskId && todayKey(tz, Date.parse(l.doneAt)) === dayKey);
}

/* --------------------------------------------------------------- status */

export type TaskStatus = {
  kind: 'ok' | 'due' | 'over' | 'event';
  /** Runs logged today, for a task with a daily rhythm. */
  doneToday: number;
  /** Whole days since the last run, or null when there has never been one. */
  daysSince: number | null;
};

/**
 * Is this task waiting?
 *
 * Three different questions, depending on the task. A job with fixed days is
 * late only once one of its days has gone by — Friday's Kita run is not
 * overdue on Tuesday. A daily job counts today's runs against today's target.
 * Everything else compares the gap since the last run against the gap the
 * rhythm asks for. A job that happens on an event is never late by itself.
 */
export function taskStatus(
  task: HouseholdTask, logs: TaskLog[], tz: string, now: number = Date.now()
): TaskStatus {
  const today = todayKey(tz, now);
  const last = lastLog(logs, task.id);
  const daysSince = last ? Math.floor((now - Date.parse(last.doneAt)) / DAY_MS) : null;
  const doneToday = logsOnDay(logs, task.id, today, tz).length;

  if (task.rhythm.kind === 'ereignis') return { kind: 'event', doneToday, daysSince };

  if (task.rhythm.kind === 'termine') {
    if (doneToday) return { kind: 'ok', doneToday, daysSince };
    const planned = task.dates.map(d => d.date).sort();
    if (planned.includes(today)) return { kind: 'due', doneToday, daysSince };
    const passed = planned.filter(d => d < today);
    const lastPlanned = passed[passed.length - 1];
    if (!lastPlanned) return { kind: 'ok', doneToday, daysSince };
    // Done a day late still counts: what makes it late is nothing since.
    const lastKey = last ? todayKey(tz, Date.parse(last.doneAt)) : null;
    return { kind: !lastKey || lastKey < lastPlanned ? 'over' : 'ok', doneToday, daysSince };
  }

  const target = dailyTarget(task);
  if (target) {
    return { kind: doneToday >= target.min ? 'ok' : 'due', doneToday, daysSince };
  }

  if (task.weekdays.length) {
    if (doneToday) return { kind: 'ok', doneToday, daysSince };
    if (task.weekdays.includes(weekdayNumber(today))) return { kind: 'due', doneToday, daysSince };
    // The most recent day this task was meant to happen. Missing that one is
    // what makes it late, not the calendar moving on.
    let day = addDaysToKey(today, -1);
    for (let i = 0; i < 7; i++) {
      if (task.weekdays.includes(weekdayNumber(day))) break;
      day = addDaysToKey(day, -1);
    }
    const lastKey = last ? todayKey(tz, Date.parse(last.doneAt)) : null;
    return { kind: !lastKey || lastKey < day ? 'over' : 'ok', doneToday, daysSince };
  }

  if (!last) return { kind: 'over', doneToday, daysSince };
  const interval = 7 / Math.max(0.01, plannedPerWeek(task));
  const ratio = (now - Date.parse(last.doneAt)) / DAY_MS / interval;
  return { kind: ratio >= 1.25 ? 'over' : ratio >= 0.85 ? 'due' : 'ok', doneToday, daysSince };
}

/** True when the measured rate has drifted far enough to be worth saying. */
export function driftsFromPlan(
  task: HouseholdTask, logs: TaskLog[], now: number = Date.now()
): boolean {
  if (task.rhythm.kind === 'ereignis' || task.rhythm.kind === 'termine') return false;
  const from = now - 28 * DAY_MS;
  const n = logs.filter(l => l.taskId === task.id && Date.parse(l.doneAt) >= from).length;
  if (n < 4) return false;
  const planned = plannedPerWeek(task);
  return planned > 0 && Math.abs(measuredPerWeek(logs, task.id, now) - planned) / planned > 0.3;
}

/* ----------------------------------------------------------- the split */

/** Minutes per person over a window — the whole point of the feature. */
export function minutesByPerson(
  logs: TaskLog[], since: number, taskIds?: Set<string>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of logs) {
    if (!l.personId) continue;
    if (taskIds && !taskIds.has(l.taskId)) continue;
    if (Date.parse(l.doneAt) < since) continue;
    out.set(l.personId, (out.get(l.personId) ?? 0) + l.minutes);
  }
  return out;
}

/* ------------------------------------------------------------ formatting */

export function fmtMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${String(rest).padStart(2, '0')}` : `${h} h`;
}

/** "2,4" — a rate reads as a decimal, and German writes it with a comma. */
export function fmtRate(n: number): string {
  return n.toFixed(1).replace('.', ',').replace(',0', '');
}

export function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, '0')}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* -------------------------------------------------------------- starter */

/** A task as the form edits it. The planned days are written on their own. */
export type TaskDraft = Omit<HouseholdTask, 'id' | 'sortOrder' | 'dates'>;

export function emptyTask(): TaskDraft {
  return {
    name: '', area: 'haushalt', rhythm: { kind: 'takt', min: 1, max: 1, per: 'woche' },
    minutes: 15, askDuration: false, logEach: false, coordination: false,
    weekdays: [], ownerPersonId: null, active: true,
  };
}

const draft = (
  name: string, area: string, rhythm: HouseholdTask['rhythm'], minutes: number,
  extra: Partial<TaskDraft> = {}
): TaskDraft => ({ ...emptyTask(), name, area, rhythm, minutes, ...extra });

/**
 * A household's usual suspects, offered once while the list is still empty.
 * Typing twenty tasks before seeing anything is how a tool like this dies on
 * the first evening. Deliberately plain — whatever is particular to a flat
 * (an Airbnb, a horse, a pool) is the family's to add, not ours to assume.
 */
export const STARTER_TASKS: TaskDraft[] = [
  draft('Spülmaschine ausräumen', 'kueche', { kind: 'takt', min: 1, max: 1, per: 'tag' }, 6),
  draft('Küche aufräumen', 'kueche', { kind: 'takt', min: 1, max: 1, per: 'tag' }, 10),
  draft('Kochen', 'kueche', { kind: 'takt', min: 4, max: 7, per: 'woche' }, 35, { askDuration: true }),
  draft('Wäsche waschen & aufhängen', 'waesche', { kind: 'takt', min: 2, max: 4, per: 'woche' }, 20, { askDuration: true }),
  draft('Wäsche abhängen', 'waesche', { kind: 'takt', min: 2, max: 4, per: 'woche' }, 10, { askDuration: true }),
  draft('Wäsche verräumen', 'waesche', { kind: 'takt', min: 1, max: 2, per: 'woche' }, 15),
  draft('Staubsaugen', 'haushalt', { kind: 'takt', min: 1, max: 2, per: 'woche' }, 25, { askDuration: true }),
  draft('Bad putzen', 'haushalt', { kind: 'takt', min: 1, max: 1, per: 'woche' }, 25),
  draft('Betten frisch beziehen', 'haushalt', { kind: 'intervall', every: 2, unit: 'wochen' }, 20),
  draft('Blumen giessen', 'haushalt', { kind: 'takt', min: 2, max: 2, per: 'woche' }, 10),
  draft('Wocheneinkauf', 'einkauf', { kind: 'takt', min: 1, max: 1, per: 'woche' }, 35, { coordination: true }),
  draft('Müll rausbringen', 'entsorgung', { kind: 'takt', min: 1, max: 2, per: 'woche' }, 5),
  draft('Altglas entsorgen', 'entsorgung', { kind: 'takt', min: 1, max: 2, per: 'woche' }, 15),
  draft('Karton rausstellen', 'entsorgung', { kind: 'intervall', every: 2, unit: 'wochen' }, 10),
];
