import { describe, expect, it } from 'vitest';
import { describeRepeat, expandManualSeries, expandSeries } from '../src/lib/recurrence.ts';
import type { ManualSeries, RepeatRule } from '../src/lib/recurrence.ts';
import { buildCells } from '../src/lib/merge.ts';
import type { Person } from '../src/lib/types.ts';

const TZ = 'Europe/Zurich';

function series(extra: Partial<ManualSeries> = {}): ManualSeries {
  return {
    id: 'ev-1',
    title: 'Kita',
    notes: '',
    allDay: true,
    startDate: '2026-09-04',   // a Friday
    endDate: '2026-09-04',
    startsAt: null,
    endsAt: null,
    personIds: ['p-lars', 'p-miri'],
    color: '#111',
    repeat: null,
    exceptions: [],
    ...extra,
  };
}

const WEEKLY_FRIDAY: RepeatRule = { freq: 'weekly', interval: 1, weekdays: [5], until: null };

function days(events: { startDate: string }[]): string[] {
  return events.map(e => e.startDate);
}

describe('expandSeries — one-off entries', () => {
  it('returns the entry itself when it touches the window', () => {
    const events = expandSeries(series(), '2026-09-01', '2026-09-30', TZ);
    expect(days(events)).toEqual(['2026-09-04']);
    expect(events[0].occurrence).toBeNull();
    expect(events[0].key).toBe('man:ev-1');
  });

  it('returns nothing when it lies outside the window', () => {
    expect(expandSeries(series(), '2026-10-01', '2026-10-31', TZ)).toEqual([]);
  });

  it('keeps a multi-day entry that started before the window', () => {
    const ferien = series({ startDate: '2026-09-28', endDate: '2026-10-09' });
    const events = expandSeries(ferien, '2026-10-01', '2026-10-31', TZ);
    expect(events).toHaveLength(1);
    expect(events[0].endDate).toBe('2026-10-09');
  });
});

describe('expandSeries — weekly series', () => {
  it('repeats on the chosen weekday', () => {
    const events = expandSeries(series({ repeat: WEEKLY_FRIDAY }), '2026-09-01', '2026-09-30', TZ);
    expect(days(events)).toEqual(['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']);
  });

  it('repeats on several weekdays', () => {
    const monThu: RepeatRule = { freq: 'weekly', interval: 1, weekdays: [1, 4], until: null };
    const events = expandSeries(
      series({ startDate: '2026-09-07', endDate: '2026-09-07', repeat: monThu }),
      '2026-09-07', '2026-09-20', TZ
    );
    expect(days(events)).toEqual(['2026-09-07', '2026-09-10', '2026-09-14', '2026-09-17']);
  });

  it('honours an interval of two weeks', () => {
    const everyOther: RepeatRule = { ...WEEKLY_FRIDAY, interval: 2 };
    const events = expandSeries(series({ repeat: everyOther }), '2026-09-01', '2026-10-15', TZ);
    expect(days(events)).toEqual(['2026-09-04', '2026-09-18', '2026-10-02']);
  });

  it('stops at the end date', () => {
    const untilSeptember: RepeatRule = { ...WEEKLY_FRIDAY, until: '2026-09-18' };
    const events = expandSeries(series({ repeat: untilSeptember }), '2026-09-01', '2026-10-31', TZ);
    expect(days(events)).toEqual(['2026-09-04', '2026-09-11', '2026-09-18']);
  });

  it('keeps running when there is no end date', () => {
    const events = expandSeries(series({ repeat: WEEKLY_FRIDAY }), '2027-03-01', '2027-03-31', TZ);
    expect(days(events)).toEqual(['2027-03-05', '2027-03-12', '2027-03-19', '2027-03-26']);
  });

  it('leaves out a single removed occurrence', () => {
    const withException = series({ repeat: WEEKLY_FRIDAY, exceptions: ['2026-09-11'] });
    const events = expandSeries(withException, '2026-09-01', '2026-09-30', TZ);
    expect(days(events)).toEqual(['2026-09-04', '2026-09-18', '2026-09-25']);
  });

  it('gives every occurrence its own key and date', () => {
    const events = expandSeries(series({ repeat: WEEKLY_FRIDAY }), '2026-09-01', '2026-09-12', TZ);
    expect(events.map(e => e.key)).toEqual(['man:ev-1:2026-09-04', 'man:ev-1:2026-09-11']);
    expect(events.map(e => e.occurrence)).toEqual(['2026-09-04', '2026-09-11']);
    // Both point back at the same series row.
    expect(new Set(events.map(e => e.id))).toEqual(new Set(['ev-1']));
  });

  it('carries the rule so the detail sheet can offer the scope choice', () => {
    const [event] = expandSeries(series({ repeat: WEEKLY_FRIDAY }), '2026-09-01', '2026-09-10', TZ);
    expect(event.repeat).toEqual(WEEKLY_FRIDAY);
  });

  it('keeps a multi-day span on every occurrence', () => {
    const weekend = series({
      startDate: '2026-09-04', endDate: '2026-09-06', repeat: WEEKLY_FRIDAY,
    });
    const events = expandSeries(weekend, '2026-09-01', '2026-09-20', TZ);
    expect(events.map(e => `${e.startDate}→${e.endDate}`)).toEqual([
      '2026-09-04→2026-09-06', '2026-09-11→2026-09-13', '2026-09-18→2026-09-20',
    ]);
  });
});

describe('expandSeries — times', () => {
  const timed = series({
    allDay: false,
    startDate: '2026-10-16', endDate: '2026-10-16',   // Friday before the DST switch
    startsAt: '2026-10-16T06:00:00.000Z',             // 08:00 Zurich (CEST)
    endsAt: '2026-10-16T14:00:00.000Z',               // 16:00 Zurich
    repeat: WEEKLY_FRIDAY,
  });

  it('keeps the wall clock across the DST switch', () => {
    // 25.10.2026 is CEST → CET; 08:00 local must stay 08:00 local.
    const events = expandSeries(timed, '2026-10-01', '2026-11-15', TZ);
    expect(events.map(e => e.startsAt)).toEqual([
      '2026-10-16T06:00:00.000Z',
      '2026-10-23T06:00:00.000Z',
      '2026-10-30T07:00:00.000Z',
      '2026-11-06T07:00:00.000Z',
      '2026-11-13T07:00:00.000Z',
    ]);
  });

  it('moves the end with the occurrence', () => {
    const [, second] = expandSeries(timed, '2026-10-01', '2026-10-31', TZ);
    expect(second.startsAt).toBe('2026-10-23T06:00:00.000Z');
    expect(second.endsAt).toBe('2026-10-23T14:00:00.000Z');
    expect(second.allDay).toBe(false);
  });
});

describe('expandManualSeries + buildCells', () => {
  const people: Person[] = [
    { id: 'p-lars', name: 'Lars', shortName: null, color: '#1', sortOrder: 0, aliases: [], userId: null, archivedAt: null },
    { id: 'p-miri', name: 'Miri', shortName: null, color: '#2', sortOrder: 1, aliases: [], userId: null, archivedAt: null },
  ];

  it('puts every Friday in both people\'s columns', () => {
    const week = ['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'];
    const events = expandManualSeries([series({ repeat: WEEKLY_FRIDAY })], week[0], week[6], TZ);
    const cells = buildCells(week, people, events);
    expect(cells.get('2026-09-04')!.get('p-lars')!.map(e => e.title)).toEqual(['Kita']);
    expect(cells.get('2026-09-04')!.get('p-miri')!.map(e => e.title)).toEqual(['Kita']);
    expect(cells.get('2026-09-05')!.get('p-lars')).toEqual([]);
  });
});

describe('describeRepeat', () => {
  it('names the rule the way the sheet shows it', () => {
    expect(describeRepeat(WEEKLY_FRIDAY)).toBe('wöchentlich Fr');
    expect(describeRepeat({ freq: 'weekly', interval: 2, weekdays: [1, 4], until: null }))
      .toBe('alle 2 Wochen Mo, Do');
    expect(describeRepeat({ ...WEEKLY_FRIDAY, until: '2027-07-10' }))
      .toBe('wöchentlich Fr, bis 10.7.2027');
  });

  it('orders the weekdays from Monday', () => {
    expect(describeRepeat({ freq: 'weekly', interval: 1, weekdays: [0, 5, 1], until: null }))
      .toBe('wöchentlich Mo, Fr, So');
  });
});
