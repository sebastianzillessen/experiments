import { describe, expect, it } from 'vitest';
import {
  defaultMinutes, driftsFromPlan, durationStats, fmtElapsed, fmtMinutes, fmtRate,
  dateLabel, measuredPerWeek, minutesByPerson, nextDate, plannedPerWeek, rhythmLabel, taskStatus,
  weeklyMinutes,
} from '../src/lib/tasks.ts';
import type { HouseholdTask, TaskLog, TaskRhythm } from '../src/lib/types.ts';

const TZ = 'Europe/Zurich';
// A Tuesday, mid-afternoon in Zurich.
const NOW = Date.parse('2026-09-15T14:00:00+02:00');
const DAY = 86_400_000;

function task(rhythm: TaskRhythm, extra: Partial<HouseholdTask> = {}): HouseholdTask {
  return {
    id: 't1', name: 'Test', area: 'haushalt', rhythm, minutes: 10,
    askDuration: false, logEach: false, coordination: false, weekdays: [],
    ownerPersonId: null, active: true, sortOrder: 0, dates: [], ...extra,
  };
}

const log = (doneAt: string, minutes = 10, personId = 'caro', taskId = 't1'): TaskLog =>
  ({ id: `l-${doneAt}-${personId}`, taskId, personId, doneAt, minutes });

/** `days` ago, at noon local, so no case sits on a midnight boundary. */
const ago = (days: number, minutes = 10, personId = 'caro') =>
  log(new Date(NOW - days * DAY).toISOString(), minutes, personId);

describe('plannedPerWeek', () => {
  it('counts a daily rhythm over the whole week', () => {
    expect(plannedPerWeek(task({ kind: 'takt', min: 2, max: 3, per: 'tag' }))).toBeCloseTo(17.5);
  });

  it('takes the middle of a range', () => {
    expect(plannedPerWeek(task({ kind: 'takt', min: 1, max: 2, per: 'woche' }))).toBe(1.5);
  });

  it('spreads a monthly job over the weeks of a month', () => {
    expect(plannedPerWeek(task({ kind: 'takt', min: 1, max: 1, per: 'monat' }))).toBeCloseTo(0.23, 2);
  });

  it('turns an interval into a rate', () => {
    expect(plannedPerWeek(task({ kind: 'intervall', every: 6, unit: 'wochen' }))).toBeCloseTo(1 / 6);
    expect(plannedPerWeek(task({ kind: 'intervall', every: 2, unit: 'tage' }))).toBe(3.5);
  });

  it('uses the estimate for something that happens on an event', () => {
    expect(plannedPerWeek(task({ kind: 'ereignis', trigger: 'nach jedem Gast', estPerWeek: 1.5 }))).toBe(1.5);
  });
});

describe('weeklyMinutes', () => {
  it('is the rate times the length', () => {
    const t = task({ kind: 'takt', min: 3, max: 3, per: 'woche' }, { minutes: 20 });
    expect(weeklyMinutes(t)).toBe(60);
  });
});

describe('rhythmLabel', () => {
  it('names a range and the fixed days it happens on', () => {
    const t = task({ kind: 'takt', min: 1, max: 2, per: 'woche' }, { weekdays: [5, 2] });
    expect(rhythmLabel(t)).toBe('1–2× pro Woche (Di, Fr)');
  });

  it('drops the range when there is none', () => {
    expect(rhythmLabel(task({ kind: 'takt', min: 1, max: 1, per: 'tag' }))).toBe('1× pro Tag');
  });

  it('says the interval and the trigger as they are', () => {
    expect(rhythmLabel(task({ kind: 'intervall', every: 6, unit: 'wochen' }))).toBe('alle 6 Wochen');
    expect(rhythmLabel(task({ kind: 'ereignis', trigger: 'nach jedem Gast', estPerWeek: 1 })))
      .toBe('nach jedem Gast');
  });
});

describe('taskStatus', () => {
  const daily = task({ kind: 'takt', min: 2, max: 3, per: 'tag' }, { logEach: true });

  it('counts today against today for a daily job', () => {
    const oneWalk = [log('2026-09-15T08:00:00+02:00')];
    expect(taskStatus(daily, oneWalk, TZ, NOW)).toMatchObject({ kind: 'due', doneToday: 1 });

    const twoWalks = [...oneWalk, log('2026-09-15T12:00:00+02:00')];
    expect(taskStatus(daily, twoWalks, TZ, NOW)).toMatchObject({ kind: 'ok', doneToday: 2 });
  });

  it('does not carry yesterday`s walks into today', () => {
    const yesterday = [log('2026-09-14T08:00:00+02:00'), log('2026-09-14T18:00:00+02:00')];
    expect(taskStatus(daily, yesterday, TZ, NOW)).toMatchObject({ kind: 'due', doneToday: 0 });
  });

  const friday = task({ kind: 'takt', min: 1, max: 1, per: 'woche' }, { weekdays: [5] });

  it('leaves a Friday job alone on a Tuesday when Friday happened', () => {
    // Friday 11 September, done. Tuesday is simply not its day.
    expect(taskStatus(friday, [log('2026-09-11T08:00:00+02:00')], TZ, NOW).kind).toBe('ok');
  });

  it('calls it overdue once its day went by unlogged', () => {
    expect(taskStatus(friday, [log('2026-09-04T08:00:00+02:00')], TZ, NOW).kind).toBe('over');
    expect(taskStatus(friday, [], TZ, NOW).kind).toBe('over');
  });

  it('is due on its own day, until it is done', () => {
    const onFriday = Date.parse('2026-09-18T09:00:00+02:00');
    expect(taskStatus(friday, [log('2026-09-11T08:00:00+02:00')], TZ, onFriday).kind).toBe('due');
    expect(taskStatus(friday, [log('2026-09-18T07:30:00+02:00')], TZ, onFriday).kind).toBe('ok');
  });

  it('measures everything else against the gap its rhythm asks for', () => {
    const weekly = task({ kind: 'takt', min: 1, max: 1, per: 'woche' });
    expect(taskStatus(weekly, [ago(2)], TZ, NOW).kind).toBe('ok');
    expect(taskStatus(weekly, [ago(6.5)], TZ, NOW).kind).toBe('due');
    expect(taskStatus(weekly, [ago(10)], TZ, NOW).kind).toBe('over');
    expect(taskStatus(weekly, [], TZ, NOW).kind).toBe('over');
  });

  it('never puts an event-driven job under pressure', () => {
    const onEvent = task({ kind: 'ereignis', trigger: 'nach jedem Gast', estPerWeek: 1 });
    expect(taskStatus(onEvent, [ago(40)], TZ, NOW).kind).toBe('event');
  });
});

describe('durations', () => {
  const logs = [ago(1, 5), ago(3, 20), ago(5, 12), ago(9, 8)];

  it('reports the spread, which for laundry is the whole story', () => {
    expect(durationStats(logs, 't1')).toEqual({ n: 4, min: 5, median: 12, max: 20 });
  });

  it('has nothing to say about a task nobody has done', () => {
    expect(durationStats(logs, 'other')).toBeNull();
  });

  it('books the measured middle once there is enough of it', () => {
    const t = task({ kind: 'takt', min: 1, max: 1, per: 'woche' }, { minutes: 30 });
    expect(defaultMinutes(t, logs)).toBe(12);
    // Two entries are not a measurement, so the estimate stands.
    expect(defaultMinutes(t, logs.slice(0, 2))).toBe(30);
  });
});

describe('measured rate', () => {
  it('is counted over four weeks, however long ago the entries are', () => {
    const logs = [ago(1), ago(8), ago(15), ago(22), ago(40)];
    expect(measuredPerWeek(logs, 't1', NOW)).toBe(1);
  });

  it('only speaks up when there is enough of it and it drifted far enough', () => {
    const weekly = task({ kind: 'takt', min: 1, max: 1, per: 'woche' });
    const asPlanned = [ago(1), ago(8), ago(15), ago(22)];
    expect(driftsFromPlan(weekly, asPlanned, NOW)).toBe(false);

    const twiceAsOften = [...asPlanned, ago(3), ago(10), ago(17), ago(24)];
    expect(driftsFromPlan(weekly, twiceAsOften, NOW)).toBe(true);

    // Three entries in four weeks is a hint, not a finding.
    expect(driftsFromPlan(weekly, [ago(1), ago(8), ago(15)], NOW)).toBe(false);
  });
});

describe('minutesByPerson', () => {
  it('adds up what each of them actually did', () => {
    const logs = [
      ago(1, 20, 'caro'), ago(2, 10, 'basti'), ago(3, 15, 'caro'),
      ago(40, 90, 'basti'), // outside the window
    ];
    const split = minutesByPerson(logs, NOW - 28 * DAY);
    expect(split.get('caro')).toBe(35);
    expect(split.get('basti')).toBe(10);
  });

  it('can be narrowed to one corner of the household', () => {
    const logs = [ago(1, 20, 'caro'), log(new Date(NOW - DAY).toISOString(), 30, 'caro', 't2')];
    const split = minutesByPerson(logs, NOW - 28 * DAY, new Set(['t2']));
    expect(split.get('caro')).toBe(30);
  });
});

describe('formatting', () => {
  it('writes minutes the way a person says them', () => {
    expect(fmtMinutes(45)).toBe('45 min');
    expect(fmtMinutes(60)).toBe('1 h');
    expect(fmtMinutes(105)).toBe('1 h 45');
  });

  it('writes a rate with a comma and no trailing zero', () => {
    expect(fmtRate(2.35)).toBe('2,4');
    expect(fmtRate(2)).toBe('2');
  });

  it('counts a running stopwatch up', () => {
    expect(fmtElapsed(9_000)).toBe('0:09');
    expect(fmtElapsed(605_000)).toBe('10:05');
    expect(fmtElapsed(3_725_000)).toBe('1:02:05');
  });
});

describe('a task that is a list of dates', () => {
  const withDates = (dates: string[]) =>
    task({ kind: 'termine' }, { dates: dates.map(d => ({ date: d, note: null })) });

  it('is due on one of its days, and done once it is logged', () => {
    const t = withDates(['2026-09-15', '2026-10-03']);
    expect(taskStatus(t, [], TZ, NOW).kind).toBe('due');
    expect(taskStatus(t, [log('2026-09-15T09:00:00+02:00')], TZ, NOW).kind).toBe('ok');
  });

  it('is quiet between its days', () => {
    expect(taskStatus(withDates(['2026-10-03']), [], TZ, NOW).kind).toBe('ok');
  });

  it('is overdue once one of its days went by with nothing since', () => {
    const t = withDates(['2026-09-07', '2026-10-03']);
    expect(taskStatus(t, [], TZ, NOW).kind).toBe('over');
    // Done a day late still counts — the day was not missed, just moved.
    expect(taskStatus(t, [log('2026-09-08T09:00:00+02:00')], TZ, NOW).kind).toBe('ok');
    // A run from before that day does not settle it.
    expect(taskStatus(t, [log('2026-09-01T09:00:00+02:00')], TZ, NOW).kind).toBe('over');
  });

  it('takes its weekly load from the days it actually asks for', () => {
    // Four days in the eight weeks around today, at 90 minutes each.
    const t = task({ kind: 'termine' }, {
      minutes: 90,
      dates: ['2026-09-07', '2026-09-20', '2026-10-03', '2026-10-05']
        .map(d => ({ date: d, note: null })),
    });
    expect(plannedPerWeek(t)).toBe(0.5);
    expect(weeklyMinutes(t)).toBe(45);
  });

  it('names the next day rather than pretending to have a rhythm', () => {
    const t = withDates(['2026-09-07', '2026-10-03']);
    expect(rhythmLabel(t, '2026-09-14')).toBe('feste Termine (1 offen)');
    expect(nextDate(t, TZ, NOW)).toBe('2026-10-03');
    expect(dateLabel('2026-10-03')).toBe('Sa, 3. Okt.');
  });
});
