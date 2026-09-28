import { describe, expect, it } from 'vitest';
import { dueMenuImports, isoWeekOf, wallClock } from '../src/lib/menuSchedule.ts';
import type { MenuSource } from '../src/lib/types.ts';

const TZ = 'Europe/Zurich';

function source(id: string, enabled = true): MenuSource {
  return { id, label: id, baseUrl: 'https://example.test/', pathPatterns: ['{KW}.pdf'], enabled };
}

/** A moment in the family's own zone, so the tests read as wall clock. */
function at(local: string): number {
  // Zurich is UTC+2 in September, which is the week these tests use.
  return Date.parse(`${local}+02:00`);
}

const FRIDAY_AFTERNOON = at('2026-09-11T13:00:00');
const KITA = source('kita');

function due(over: Partial<Parameters<typeof dueMenuImports>[0]> = {}) {
  return dueMenuImports({
    nowMs: FRIDAY_AFTERNOON, timeZone: TZ, sources: [KITA], weeks: [], ...over,
  });
}

/** The current week, which is due whenever it is missing. */
const THIS_WEEK = { sourceId: 'kita', year: 2026, week: 37 };
const NEXT_WEEK = { sourceId: 'kita', year: 2026, week: 38 };

describe('wallClock', () => {
  it('reads the day and hour in the family zone, not in UTC', () => {
    // 23:30 UTC on the Friday is already Saturday in Zurich.
    expect(wallClock(Date.parse('2026-09-11T23:30:00Z'), TZ))
      .toEqual({ date: '2026-09-12', weekday: 6, hour: 1 });
    expect(wallClock(Date.parse('2026-09-11T23:30:00Z'), 'UTC'))
      .toEqual({ date: '2026-09-11', weekday: 5, hour: 23 });
  });
});

describe('isoWeekOf', () => {
  it('numbers the weeks the way the school does', () => {
    expect(isoWeekOf('2026-09-11')).toEqual({ year: 2026, week: 37 });
    expect(isoWeekOf('2026-09-14')).toEqual({ year: 2026, week: 38 });
  });

  it('carries the turn of the year, where the week and the date disagree', () => {
    // 2026-12-31 is a Thursday, so it still belongs to week 53 of 2026 …
    expect(isoWeekOf('2026-12-31')).toEqual({ year: 2026, week: 53 });
    // … and 2027-01-01, a Friday, belongs to the same one.
    expect(isoWeekOf('2027-01-01')).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf('2027-01-04')).toEqual({ year: 2027, week: 1 });
  });
});

describe('dueMenuImports', () => {
  it('wants the current week too, so a source added midweek fills in at once', () => {
    // Wednesday: the coming week is nobody's business yet, but today's is.
    expect(due({ nowMs: at('2026-09-09T10:00:00') })).toEqual([THIS_WEEK]);
  });

  it('adds the coming week once Friday afternoon comes round', () => {
    expect(due()).toEqual([THIS_WEEK, NEXT_WEEK]);
  });

  it('waits until the afternoon for the coming week', () => {
    expect(due({ nowMs: at('2026-09-11T12:59:00') })).toEqual([THIS_WEEK]);
    expect(due({ nowMs: at('2026-09-11T13:00:00') })).toEqual([THIS_WEEK, NEXT_WEEK]);
  });

  it('keeps asking over the weekend, when the school publishes late', () => {
    expect(due({ nowMs: at('2026-09-12T09:00:00') })).toEqual([THIS_WEEK, NEXT_WEEK]);
    expect(due({ nowMs: at('2026-09-13T20:00:00') })).toEqual([THIS_WEEK, NEXT_WEEK]);
  });

  it('asks for today before Monday, because a plan for today is worth more', () => {
    expect(due()[0]).toEqual(THIS_WEEK);
  });

  it('stops once a week is there', () => {
    expect(due({ weeks: [THIS_WEEK] })).toEqual([NEXT_WEEK]);
    expect(due({ weeks: [THIS_WEEK, NEXT_WEEK] })).toEqual([]);
  });

  it('is not satisfied by another source having the week', () => {
    expect(due({
      sources: [KITA, source('schule')],
      weeks: [{ sourceId: 'schule', year: 2026, week: 37 }, { sourceId: 'schule', year: 2026, week: 38 }],
    })).toEqual([THIS_WEEK, NEXT_WEEK]);
  });

  it('leaves a disabled source alone', () => {
    expect(due({ sources: [source('kita', false)] })).toEqual([]);
  });

  it('counts the week across the turn of the year', () => {
    // Friday 2026-12-25: the week that follows is 53, still of 2026.
    expect(due({ nowMs: at('2026-12-25T14:00:00') })).toEqual([
      { sourceId: 'kita', year: 2026, week: 52 },
      { sourceId: 'kita', year: 2026, week: 53 },
    ]);
    // Friday 2027-01-01 is itself still week 53 of 2026; next is week 1 of 2027.
    expect(due({ nowMs: at('2027-01-01T14:00:00') })).toEqual([
      { sourceId: 'kita', year: 2026, week: 53 },
      { sourceId: 'kita', year: 2027, week: 1 },
    ]);
  });

  it('has nothing to do without a source', () => {
    expect(due({ sources: [] })).toEqual([]);
  });
});
