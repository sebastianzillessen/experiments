import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CANTONS, CANTON_CODES, cantonName, cantonState, durationLabel, nextTrip, nights,
  progress, sortTrips, tripDates, tripsOf,
} from '../src/lib/cantons.ts';
import type { Trip } from '../src/lib/types.ts';

const trip = (canton: string, extra: Partial<Trip> = {}): Trip => ({
  id: `${canton}-${extra.title ?? 'x'}`, canton, title: 'Ausflug', notes: '',
  fromDate: null, toDate: null, done: false, doneOn: null, source: 'eigen', ...extra,
});

describe('the list itself', () => {
  it('has all 26 cantons, each once', () => {
    expect(CANTONS).toHaveLength(26);
    expect(new Set(CANTON_CODES).size).toBe(26);
  });

  it('agrees with the codes the database accepts', () => {
    const sql = readFileSync(
      new URL('../supabase/migrations/20260921100000_fp_canton_trips.sql', import.meta.url), 'utf8'
    );
    const inCheck = [...sql.matchAll(/'([A-Z]{2})'/g)].map(m => m[1]);
    expect(new Set(inCheck)).toEqual(new Set(CANTON_CODES));
  });

  it('is sorted the way the screen reads it', () => {
    expect(CANTONS[0].name).toBe('Aargau');
    expect(CANTONS[25].name).toBe('Zürich');
  });

  it('names a canton, and leaves an unknown code as it is', () => {
    expect(cantonName('GR')).toBe('Graubünden');
    expect(cantonName('XX')).toBe('XX');
  });
});

describe('where a canton stands', () => {
  const trips = [
    trip('ZH', { done: true, doneOn: '2026-03-14' }),
    trip('TI', { fromDate: '2026-10-03' }),
  ];

  it('is visited once one of its trips is ticked off', () => {
    expect(cantonState(trips, 'ZH')).toBe('besucht');
  });

  it('is planned while a trip is only planned', () => {
    expect(cantonState(trips, 'TI')).toBe('geplant');
  });

  it('is open when nothing has been written for it', () => {
    expect(cantonState(trips, 'UR')).toBe('offen');
  });

  it('stays visited when a second trip there is still open', () => {
    const more = [...trips, trip('ZH', { title: 'Nochmal', fromDate: '2026-12-01' })];
    expect(cantonState(more, 'ZH')).toBe('besucht');
    expect(tripsOf(more, 'ZH')).toHaveLength(2);
  });
});

describe('progress', () => {
  it('counts cantons, not trips', () => {
    const trips = [
      trip('ZH', { done: true }), trip('ZH', { title: 'Zweimal', done: true }),
      trip('BE', { done: true }),
      trip('TI', { fromDate: '2026-10-03' }),
    ];
    expect(progress(trips)).toEqual({ visited: 2, planned: 1, total: 26 });
  });

  it('does not count a visited canton as planned as well', () => {
    const trips = [trip('ZH', { done: true }), trip('ZH', { title: 'Wieder' })];
    expect(progress(trips)).toEqual({ visited: 1, planned: 0, total: 26 });
  });

  it('starts at nothing', () => {
    expect(progress([])).toEqual({ visited: 0, planned: 0, total: 26 });
  });
});

describe('sortTrips', () => {
  it('puts what is still ahead first, soonest first, and the dateless last', () => {
    const list = [
      trip('ZH', { title: 'Irgendwann' }),
      trip('ZH', { title: 'Bald', fromDate: '2026-10-03' }),
      trip('ZH', { title: 'Erledigt', done: true, doneOn: '2026-02-01' }),
      trip('ZH', { title: 'Später', fromDate: '2026-11-20' }),
    ];
    expect(sortTrips(list).map(t => t.title))
      .toEqual(['Bald', 'Später', 'Irgendwann', 'Erledigt']);
  });

  it('shows the most recent of what is done first', () => {
    const list = [
      trip('ZH', { title: 'Älter', done: true, doneOn: '2026-01-05' }),
      trip('ZH', { title: 'Neuer', done: true, doneOn: '2026-06-05' }),
    ];
    expect(sortTrips(list).map(t => t.title)).toEqual(['Neuer', 'Älter']);
  });
});

describe('nextTrip', () => {
  const list = [
    trip('TI', { fromDate: '2026-10-03' }),
    trip('GR', { fromDate: '2026-09-12' }),
    trip('VS', { fromDate: '2026-11-01', done: true }),
  ];

  it('is the soonest one still ahead', () => {
    expect(nextTrip(list, '2026-09-01')?.canton).toBe('GR');
  });

  it('skips what has already been', () => {
    expect(nextTrip(list, '2026-09-20')?.canton).toBe('TI');
    expect(nextTrip(list, '2026-12-01')).toBeNull();
  });

  it('has nothing to say about trips without a date', () => {
    expect(nextTrip([trip('UR')], '2026-09-01')).toBeNull();
  });
});

describe('dates and nights', () => {
  it('counts nights, and calls a single day none', () => {
    expect(nights(trip('ZH', { fromDate: '2026-10-03', toDate: '2026-10-04' }))).toBe(1);
    expect(nights(trip('ZH', { fromDate: '2026-10-03' }))).toBe(0);
  });

  it('writes a range the short way when it stays inside a month', () => {
    expect(tripDates(trip('ZH', { fromDate: '2026-10-03' }))).toBe('3. Okt.');
    expect(tripDates(trip('ZH', { fromDate: '2026-10-03', toDate: '2026-10-04' })))
      .toBe('3.–4. Okt.');
    expect(tripDates(trip('ZH', { fromDate: '2026-10-31', toDate: '2026-11-02' })))
      .toBe('31. Okt. – 2. Nov.');
  });

  it('falls back to when it happened, or says there is no date', () => {
    expect(tripDates(trip('ZH', { done: true, doneOn: '2026-03-14' }))).toBe('14. März');
    expect(tripDates(trip('ZH'))).toBe('ohne Datum');
  });

  it('names the two lengths a suggestion comes in', () => {
    expect(durationLabel('tag')).toBe('Tagesausflug');
    expect(durationLabel('zwei-tage')).toBe('Zwei Tage');
  });
});
