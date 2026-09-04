import { describe, expect, it } from 'vitest';
import { menuEventsToPlanner, weekdayOf } from '../src/lib/menuPlan.ts';
import type { MenuAssignment, MenuSource, MenuWeek } from '../src/lib/types.ts';

const source: MenuSource = {
  id: 's1', label: 'Schule Hutten', baseUrl: 'https://example.org/', 
  pathPatterns: ['{KW}.{JJ}.pdf'], enabled: true,
};

// Week 37 of 2026: Monday 7 to Friday 11 September.
const week: MenuWeek = {
  id: 'w1', sourceId: 's1', year: 2026, week: 37,
  from: '2026-09-07', to: '2026-09-11', importedAt: null,
  days: [
    { date: '2026-09-07', dishes: [
      { name: 'Lasagne (R)', tags: [] },
      { name: 'Erbsli und Rüebli', tags: ['lactose-free', 'gluten-free'] },
    ] },
    { date: '2026-09-09', dishes: [{ name: 'Gebratenes Buntbarschfilet (ASC)', tags: [] }] },
    { date: '2026-09-11', dishes: [{ name: 'Bio-Reis', tags: ['seasonal'] }] },
  ],
};

const allWeek = (personId: string): MenuAssignment =>
  ({ sourceId: 's1', personId, weekdays: [1, 2, 3, 4, 5] });

describe('weekdayOf', () => {
  it('numbers Monday to Friday the way the assignment does', () => {
    expect(weekdayOf('2026-09-07')).toBe(1);
    expect(weekdayOf('2026-09-11')).toBe(5);
    // The weekend can never match a school day, which is the point.
    expect(weekdayOf('2026-09-12')).toBe(6);
    expect(weekdayOf('2026-09-13')).toBe(0);
  });
});

describe('menuEventsToPlanner', () => {
  it('puts every imported day in the child`s column', () => {
    const events = menuEventsToPlanner([week], [source], [allWeek('lars')]);
    expect(events.map(e => e.startDate)).toEqual(['2026-09-07', '2026-09-09', '2026-09-11']);
    expect(events.every(e => e.personIds.length === 1 && e.personIds[0] === 'lars')).toBe(true);
    expect(events.every(e => e.allDay && e.source === 'menu')).toBe(true);
  });

  it('joins the dishes onto one line for the chip', () => {
    const [monday] = menuEventsToPlanner([week], [source], [allWeek('lars')]);
    expect(monday.displayTitle).toBe('Lasagne (R) · Erbsli und Rüebli');
  });

  it('spells the markers out in the detail text', () => {
    const [monday] = menuEventsToPlanner([week], [source], [allWeek('lars')]);
    expect(monday.notes).toBe(
      'Lasagne (R)\nErbsli und Rüebli (ohne Laktose, ohne Gluten)');
  });

  it('only shows a child the days it is actually at school', () => {
    const events = menuEventsToPlanner([week], [source], [
      { sourceId: 's1', personId: 'lars', weekdays: [1, 2, 3] },
    ]);
    expect(events.map(e => e.startDate)).toEqual(['2026-09-07', '2026-09-09']);
  });

  it('feeds two children from one import, on their own days', () => {
    const events = menuEventsToPlanner([week], [source], [
      { sourceId: 's1', personId: 'lars', weekdays: [1, 2, 3, 4, 5] },
      { sourceId: 's1', personId: 'miriam', weekdays: [5] },
    ]);
    const byDay = new Map(events.map(e => [e.startDate, e.personIds]));
    expect(byDay.get('2026-09-07')).toEqual(['lars']);
    expect(byDay.get('2026-09-11')).toEqual(['lars', 'miriam']);
    // One entry per day, not one per child — the cell shows it once.
    expect(events).toHaveLength(3);
  });

  it('shows nothing when nobody eats there', () => {
    expect(menuEventsToPlanner([week], [source], [])).toEqual([]);
  });

  it('shows nothing from a source that was switched off', () => {
    const off = [{ ...source, enabled: false }];
    expect(menuEventsToPlanner([week], off, [allWeek('lars')])).toEqual([]);
  });

  it('ignores a week whose source is gone', () => {
    expect(menuEventsToPlanner([week], [], [allWeek('lars')])).toEqual([]);
  });

  it('skips a day the importer could not read', () => {
    const gap = { ...week, days: [...week.days, { date: '2026-09-10', dishes: [] }] };
    const events = menuEventsToPlanner([gap], [source], [allWeek('lars')]);
    expect(events.map(e => e.startDate)).not.toContain('2026-09-10');
  });

  it('gives every entry a key of its own', () => {
    const other = { ...week, id: 'w2' };
    const events = menuEventsToPlanner([week, other], [source], [allWeek('lars')]);
    expect(new Set(events.map(e => e.key)).size).toBe(events.length);
  });
});
