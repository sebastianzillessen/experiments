import { describe, expect, it } from 'vitest';
import { buildCells, calendarEventsToPlanner } from '../src/lib/merge.ts';
import { FAMILY_COLUMN } from '../src/lib/types.ts';
import type { Assignment, CachedEvent, Calendar, Person, PlannerEvent } from '../src/lib/types.ts';

function person(id: string, name: string): Person {
  return { id, name, shortName: null, color: '#111', sortOrder: 0, aliases: [], userId: null, archivedAt: null };
}

const LILLY = person('p-lilly', 'Lilly');
const MIRI = person('p-miri', 'Miri');
const PEOPLE = [LILLY, MIRI];

const CALENDAR: Calendar = {
  id: 'cal-1', label: 'Familie', kind: 'ics', color: '#8a7d64', enabled: true,
  urlPreview: 'calendar.google.com/…/basic.ics', ttlMinutes: 30,
  lastSyncedAt: null, lastError: null,
};

function cached(title: string, extra: Partial<CachedEvent> = {}): CachedEvent {
  return {
    uid: `uid-${title}`, occurrence: '2026-09-08', title, description: '', location: '',
    allDay: true, startDate: '2026-09-08', endDate: '2026-09-08', startsAt: null, endsAt: null,
    ...extra,
  };
}

function manual(id: string, extra: Partial<PlannerEvent> = {}): PlannerEvent {
  return {
    key: `man:${id}`, source: 'manual', id, calendarId: null, calendarLabel: null,
    uid: null, occurrence: null, title: id, displayTitle: id, notes: '', allDay: true,
    startDate: '2026-09-08', endDate: '2026-09-08', startsAt: null, endsAt: null,
    personIds: [], color: '#111', autoAssigned: false, repeat: null,
    ...extra,
  };
}

describe('calendarEventsToPlanner', () => {
  const caches = [{ calendarId: 'cal-1', events: [cached('Kita Miri'), cached('Hort Lilly')] }];

  it('assigns imported events by the names they carry', () => {
    const events = calendarEventsToPlanner(caches, [CALENDAR], PEOPLE, []);
    expect(events.map(e => [e.title, e.personIds])).toEqual([
      ['Kita Miri', ['p-miri']],
      ['Hort Lilly', ['p-lilly']],
    ]);
    expect(events[0].autoAssigned).toBe(true);
    expect(events[0].color).toBe(CALENDAR.color);
  });

  it('lets a manual override win over the name match', () => {
    const override: Assignment = {
      calendarId: 'cal-1', uid: 'uid-Kita Miri', occurrence: '2026-09-08',
      personIds: ['p-lilly'], hidden: false,
    };
    const events = calendarEventsToPlanner(caches, [CALENDAR], PEOPLE, [override]);
    const kita = events.find(e => e.title === 'Kita Miri')!;
    expect(kita.personIds).toEqual(['p-lilly']);
    expect(kita.autoAssigned).toBe(false);
  });

  it('applies a series-wide override (occurrence null) when no per-day one exists', () => {
    const override: Assignment = {
      calendarId: 'cal-1', uid: 'uid-Hort Lilly', occurrence: null,
      personIds: ['p-miri'], hidden: false,
    };
    const events = calendarEventsToPlanner(caches, [CALENDAR], PEOPLE, [override]);
    expect(events.find(e => e.title === 'Hort Lilly')!.personIds).toEqual(['p-miri']);
  });

  it('drops hidden events', () => {
    const override: Assignment = {
      calendarId: 'cal-1', uid: 'uid-Kita Miri', occurrence: '2026-09-08', personIds: [], hidden: true,
    };
    const events = calendarEventsToPlanner(caches, [CALENDAR], PEOPLE, [override]);
    expect(events.map(e => e.title)).toEqual(['Hort Lilly']);
  });

  it('ignores calendars that are disabled or unknown', () => {
    expect(calendarEventsToPlanner(caches, [{ ...CALENDAR, enabled: false }], PEOPLE, [])).toHaveLength(0);
    expect(calendarEventsToPlanner(caches, [], PEOPLE, [])).toHaveLength(0);
  });
});

describe('buildCells', () => {
  const days = ['2026-09-07', '2026-09-08', '2026-09-09'];

  it('puts an event in its person column on its day', () => {
    const cells = buildCells(days, PEOPLE, [manual('Hort', { personIds: ['p-lilly'] })]);
    expect(cells.get('2026-09-08')!.get('p-lilly')!.map(e => e.title)).toEqual(['Hort']);
    expect(cells.get('2026-09-08')!.get('p-miri')).toEqual([]);
    expect(cells.get('2026-09-07')!.get('p-lilly')).toEqual([]);
  });

  it('puts an unassigned event in the shared family column', () => {
    const cells = buildCells(days, PEOPLE, [manual('Brunch')]);
    expect(cells.get('2026-09-08')!.get(FAMILY_COLUMN)!.map(e => e.title)).toEqual(['Brunch']);
  });

  it('shows an event in every column it belongs to', () => {
    const cells = buildCells(days, PEOPLE, [manual('Kita', { personIds: ['p-lilly', 'p-miri'] })]);
    expect(cells.get('2026-09-08')!.get('p-lilly')).toHaveLength(1);
    expect(cells.get('2026-09-08')!.get('p-miri')).toHaveLength(1);
  });

  it('repeats a multi-day event on every day it covers', () => {
    const cells = buildCells(days, PEOPLE, [
      manual('Ferien', { startDate: '2026-09-06', endDate: '2026-09-09', personIds: ['p-miri'] }),
    ]);
    expect(days.map(d => cells.get(d)!.get('p-miri')!.length)).toEqual([1, 1, 1]);
  });

  it('falls back to the family column for an archived person', () => {
    const cells = buildCells(days, [MIRI], [manual('Hort', { personIds: ['p-lilly'] })]);
    expect(cells.get('2026-09-08')!.get(FAMILY_COLUMN)!.map(e => e.title)).toEqual(['Hort']);
  });

  it('sorts all-day entries before timed ones, then by clock', () => {
    const cells = buildCells(days, PEOPLE, [
      manual('Sport', { allDay: false, startsAt: '2026-09-08T14:00:00.000Z', personIds: ['p-lilly'] }),
      manual('Kiga', { personIds: ['p-lilly'] }),
      manual('Arzt', { allDay: false, startsAt: '2026-09-08T09:00:00.000Z', personIds: ['p-lilly'] }),
    ]);
    expect(cells.get('2026-09-08')!.get('p-lilly')!.map(e => e.title)).toEqual(['Kiga', 'Arzt', 'Sport']);
  });
});

describe('stripping the person out of an imported title', () => {
  const CARO = person('p-caro', 'Caro');
  const LARS = person('p-lars', 'Lars');

  function displayed(title: string, people: Person[], assignments: Assignment[] = []): string {
    const caches = [{ calendarId: 'cal-1', events: [cached(title)] }];
    const [event] = calendarEventsToPlanner(caches, [CALENDAR], people, assignments);
    return event.displayTitle;
  }

  it('drops the name once the entry sits in that person\'s column', () => {
    expect(displayed('Caro LQ', [CARO])).toBe('LQ');
  });

  it('drops a bracketed name and the empty brackets with it', () => {
    expect(displayed('[Caro] Reitstunde', [CARO])).toBe('Reitstunde');
    expect(displayed('(Caro) Reitstunde', [CARO])).toBe('Reitstunde');
  });

  it('drops every assigned name from a shared entry', () => {
    expect(displayed('Kita Miri/Lars', [MIRI, LARS])).toBe('Kita');
  });

  it('takes the word joining two names with them', () => {
    const miriam = person('p-miriam', 'Miriam');
    expect(displayed('Zusätzliche Betreuung Lars und Miriam KiTa', [LARS, miriam]))
      .toBe('Zusätzliche Betreuung KiTa');
    expect(displayed('Caro + Basti HO', [person('p-caro', 'Caro'), person('p-basti', 'Basti')]))
      .toBe('HO');
    expect(displayed('Schwimmen mit Lilly und Miri', [LILLY, MIRI])).toBe('Schwimmen');
  });

  it('keeps a joining word that is not between two names', () => {
    expect(displayed('Lilly und Oma backen', [LILLY])).toBe('Oma backen');
  });

  it('drops an alias, not just the name', () => {
    const lilly = { ...LILLY, aliases: ['Lillian'] };
    expect(displayed('Lillian Mittagessen Hort', [lilly])).toBe('Mittagessen Hort');
  });

  it('keeps the title when the name is all there is', () => {
    expect(displayed('Caro', [CARO])).toBe('Caro');
  });

  it('leaves an unmatched title alone', () => {
    expect(displayed('Brunch bei Oma', [CARO])).toBe('Brunch bei Oma');
  });

  it('leaves the full title on the event for the detail sheet', () => {
    const caches = [{ calendarId: 'cal-1', events: [cached('Caro LQ')] }];
    const [event] = calendarEventsToPlanner(caches, [CALENDAR], [CARO], []);
    expect(event.title).toBe('Caro LQ');
    expect(event.displayTitle).toBe('LQ');
  });

  it('strips the names of a manual override, not of the automatic match', () => {
    const override: Assignment = {
      calendarId: 'cal-1', uid: 'uid-Caro LQ', occurrence: '2026-09-08',
      personIds: ['p-lars'], hidden: false,
    };
    // Moved to Lars, so "Caro" is no longer a name in that column and stays.
    expect(displayed('Caro LQ', [CARO, LARS], [override])).toBe('Caro LQ');
  });
});
