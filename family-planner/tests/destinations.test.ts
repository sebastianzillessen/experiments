import { describe, expect, it } from 'vitest';
import {
  STARTERS, destinationState, durationLabel, groupsOf, inGroup, nextTrip, nights, progress,
  sortTrips, tripDates, tripsOf,
} from '../src/lib/destinations.ts';
import type { Destination, Trip } from '../src/lib/types.ts';

const place = (id: string, extra: Partial<Destination> = {}): Destination =>
  ({ id, name: id, code: null, group: 'Kantone der Schweiz', sortOrder: 0, ...extra });

const trip = (destinationId: string, extra: Partial<Trip> = {}): Trip => ({
  id: `${destinationId}-${extra.title ?? 'x'}`, destinationId, title: 'Ausflug', notes: '',
  fromDate: null, toDate: null, done: false, doneOn: null, source: 'eigen', ...extra,
});

describe('where a destination stands', () => {
  const trips = [
    trip('zh', { done: true, doneOn: '2026-03-14' }),
    trip('ti', { fromDate: '2026-10-03' }),
  ];

  it('is visited once one of its trips is ticked off', () => {
    expect(destinationState(trips, 'zh')).toBe('besucht');
  });

  it('is planned while a trip is only planned', () => {
    expect(destinationState(trips, 'ti')).toBe('geplant');
  });

  it('is open when nothing has been written for it', () => {
    expect(destinationState(trips, 'ur')).toBe('offen');
  });

  it('stays visited when a second trip there is still open', () => {
    const more = [...trips, trip('zh', { title: 'Nochmal', fromDate: '2026-12-01' })];
    expect(destinationState(more, 'zh')).toBe('besucht');
    expect(tripsOf(more, 'zh')).toHaveLength(2);
  });
});

describe('groups', () => {
  const places = [
    place('zh', { group: 'Kantone der Schweiz' }),
    place('fr', { group: 'Länder Europas' }),
    place('be', { group: 'Kantone der Schweiz' }),
  ];

  it('lists each group once, in the order it was started', () => {
    expect(groupsOf(places)).toEqual(['Kantone der Schweiz', 'Länder Europas']);
  });

  it('narrows to one list, or leaves them all', () => {
    expect(inGroup(places, 'Länder Europas').map(p => p.id)).toEqual(['fr']);
    expect(inGroup(places, null)).toHaveLength(3);
  });
});

describe('progress', () => {
  const places = [place('zh'), place('be'), place('ti'), place('ur')];

  it('counts destinations, not trips', () => {
    const trips = [
      trip('zh', { done: true }), trip('zh', { title: 'Zweimal', done: true }),
      trip('be', { done: true }),
      trip('ti', { fromDate: '2026-10-03' }),
    ];
    expect(progress(places, trips)).toEqual({ visited: 2, planned: 1, total: 4 });
  });

  it('is counted over the list it was given, so each group has its own', () => {
    const swiss = [place('zh'), place('be')];
    const europe = [place('fr', { group: 'Länder Europas' })];
    const trips = [trip('zh', { done: true }), trip('fr', { done: true })];
    expect(progress(swiss, trips)).toEqual({ visited: 1, planned: 0, total: 2 });
    expect(progress(europe, trips)).toEqual({ visited: 1, planned: 0, total: 1 });
  });

  it('starts at nothing', () => {
    expect(progress([], [])).toEqual({ visited: 0, planned: 0, total: 0 });
  });
});

describe('sortTrips', () => {
  it('puts what is still ahead first, soonest first, and the dateless last', () => {
    const list = [
      trip('zh', { title: 'Irgendwann' }),
      trip('zh', { title: 'Bald', fromDate: '2026-10-03' }),
      trip('zh', { title: 'Erledigt', done: true, doneOn: '2026-02-01' }),
      trip('zh', { title: 'Später', fromDate: '2026-11-20' }),
    ];
    expect(sortTrips(list).map(t => t.title))
      .toEqual(['Bald', 'Später', 'Irgendwann', 'Erledigt']);
  });

  it('shows the most recent of what is done first', () => {
    const list = [
      trip('zh', { title: 'Älter', done: true, doneOn: '2026-01-05' }),
      trip('zh', { title: 'Neuer', done: true, doneOn: '2026-06-05' }),
    ];
    expect(sortTrips(list).map(t => t.title)).toEqual(['Neuer', 'Älter']);
  });
});

describe('nextTrip', () => {
  const list = [
    trip('ti', { fromDate: '2026-10-03' }),
    trip('gr', { fromDate: '2026-09-12' }),
    trip('vs', { fromDate: '2026-11-01', done: true }),
  ];

  it('is the soonest one still ahead', () => {
    expect(nextTrip(list, '2026-09-01')?.destinationId).toBe('gr');
  });

  it('skips what has already been', () => {
    expect(nextTrip(list, '2026-09-20')?.destinationId).toBe('ti');
    expect(nextTrip(list, '2026-12-01')).toBeNull();
  });

  it('has nothing to say about trips without a date', () => {
    expect(nextTrip([trip('ur')], '2026-09-01')).toBeNull();
  });
});

describe('dates and nights', () => {
  it('counts nights, and calls a single day none', () => {
    expect(nights(trip('zh', { fromDate: '2026-10-03', toDate: '2026-10-04' }))).toBe(1);
    expect(nights(trip('zh', { fromDate: '2026-10-03' }))).toBe(0);
  });

  it('writes a range the short way when it stays inside a month', () => {
    expect(tripDates(trip('zh', { fromDate: '2026-10-03' }))).toBe('3. Okt.');
    expect(tripDates(trip('zh', { fromDate: '2026-10-03', toDate: '2026-10-04' })))
      .toBe('3.–4. Okt.');
    expect(tripDates(trip('zh', { fromDate: '2026-10-31', toDate: '2026-11-02' })))
      .toBe('31. Okt. – 2. Nov.');
  });

  it('falls back to when it happened, or says there is no date', () => {
    expect(tripDates(trip('zh', { done: true, doneOn: '2026-03-14' }))).toBe('14. März');
    expect(tripDates(trip('zh'))).toBe('ohne Datum');
  });

  it('names the two lengths a suggestion comes in', () => {
    expect(durationLabel('tag')).toBe('Tagesausflug');
    expect(durationLabel('zwei-tage')).toBe('Zwei Tage');
  });
});

describe('the ready-made lists', () => {
  it('offers the cantons and Europe, each entry once', () => {
    const cantons = STARTERS.find(s => s.id === 'kantone')!;
    expect(cantons.items).toHaveLength(26);
    expect(new Set(cantons.items.map(i => i.name)).size).toBe(26);

    const europe = STARTERS.find(s => s.id === 'europa')!;
    expect(europe.items.length).toBeGreaterThan(40);
    expect(new Set(europe.items.map(i => i.name)).size).toBe(europe.items.length);
  });

  it('gives every list a name and every entry a name', () => {
    for (const starter of STARTERS) {
      expect(starter.group.trim()).not.toBe('');
      for (const item of starter.items) expect(item.name.trim()).not.toBe('');
    }
  });

  it('agrees with the cantons the migration carries across', () => {
    // The data migration maps the old canton codes onto these names; a
    // mismatch would strand somebody's trips under a renamed destination.
    const sql = new URL('../supabase/migrations/20260921140000_fp_destinations.sql', import.meta.url);
    const text = require('node:fs').readFileSync(sql, 'utf8');
    const inSql = [...text.matchAll(/\('([A-Z]{2})','([^']+)',\d+\)/g)].map(m => ({ code: m[1], name: m[2] }));
    const starter = STARTERS.find(s => s.id === 'kantone')!;
    expect(inSql).toHaveLength(26);
    for (const { code, name } of inSql) {
      expect(starter.items).toContainEqual({ name, code });
    }
  });
});
