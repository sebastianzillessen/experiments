import { describe, expect, it } from 'vitest';
import { autoAssign, matchersFor, matchPeople, normalize } from '../src/lib/assign.ts';
import type { CachedEvent, Person } from '../src/lib/types.ts';

function person(name: string, extra: Partial<Person> = {}): Person {
  return {
    id: name.toLowerCase(),
    name,
    shortName: null,
    color: '#000',
    sortOrder: 0,
    aliases: [],
    userId: null,
    archivedAt: null,
    ...extra,
  };
}

const CARO = person('Caro');
const BASTI = person('Basti');
const LILLY = person('Lilly');
const MIRI = person('Miri');
const LARS = person('Lars', { aliases: ['Lasse', 'L.'] });
const FAMILY = [CARO, BASTI, LILLY, MIRI, LARS];

function event(title: string, extra: Partial<CachedEvent> = {}): CachedEvent {
  return {
    uid: 'x', occurrence: '2026-09-08', title,
    description: '', location: '',
    allDay: true, startDate: '2026-09-08', endDate: '2026-09-08',
    startsAt: null, endsAt: null,
    ...extra,
  };
}

describe('normalize', () => {
  it('folds case, diacritics and ß', () => {
    expect(normalize('Müller')).toBe('muller');
    expect(normalize('GROSS')).toBe('gross');
    expect(normalize('Straße')).toBe('strasse');
  });
});

describe('matchersFor', () => {
  it('collects name, short name and aliases, dropping one-letter noise', () => {
    expect(matchersFor(person('Lars', { shortName: 'La', aliases: ['Lasse', 'L'] })).sort())
      .toEqual(['la', 'lars', 'lasse']);
  });
});

describe('matchPeople', () => {
  it('finds a single name', () => {
    expect(matchPeople('Lilly Hort bis 16:00', FAMILY)).toEqual(['lilly']);
  });

  it('finds several people separated by a slash', () => {
    expect(matchPeople('Kita Miri/Lars', FAMILY)).toEqual(['miri', 'lars']);
  });

  it('handles + and & as separators', () => {
    expect(matchPeople('Caro + Basti HO', FAMILY)).toEqual(['caro', 'basti']);
    expect(matchPeople('Lilly & Miri Schwimmen', FAMILY)).toEqual(['lilly', 'miri']);
  });

  it('does not match inside a longer word', () => {
    expect(matchPeople('Larsson Konzert', FAMILY)).toEqual([]);
    expect(matchPeople('Karotten kaufen', FAMILY)).toEqual([]);
  });

  it('does not let a short name swallow a longer one', () => {
    // "Mi" must not match "Miri" — the abbreviation only counts as a word.
    const withShort = [person('Michael', { shortName: 'Mi' }), MIRI];
    expect(matchPeople('Waldspielgruppe Miri', withShort)).toEqual(['miri']);
    expect(matchPeople('Mi zum Arzt', withShort)).toEqual(['michael']);
  });

  it('matches aliases and is case-insensitive', () => {
    expect(matchPeople('LASSE beim Kinderarzt', FAMILY)).toEqual(['lars']);
  });

  it('returns people in the family column order, not in text order', () => {
    expect(matchPeople('Lars und Caro unterwegs', FAMILY)).toEqual(['caro', 'lars']);
  });

  it('returns nothing for an event that names no one', () => {
    expect(matchPeople('Brunch bei Oma', FAMILY)).toEqual([]);
  });
});

describe('autoAssign', () => {
  it('also looks at location and description', () => {
    expect(autoAssign(event('Zahnarzt', { location: 'Praxis Dr. Meier', description: 'für Lilly' }), FAMILY))
      .toEqual(['lilly']);
  });

  it('leaves an unmatched event for the shared column', () => {
    expect(autoAssign(event('Müllabfuhr'), FAMILY)).toEqual([]);
  });
});
