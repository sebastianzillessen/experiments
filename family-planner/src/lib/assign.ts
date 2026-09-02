// Who does a calendar entry belong to? The paper planner answers this with a
// name in the line ("Lilly Hort bis 16:00", "Kita Miri/Lars"), so the app does
// the same: match every person's name, short name and aliases against the
// event text.
//
// Rules that matter in practice:
//  - case- and diacritic-insensitive ("Miri" matches "MIRI", "Müller" "muller"),
//  - whole words only, so "Lars" does not match "Larsson" and "Mi" does not
//    match "Miri" — separators like "/", "+", "&", "," end a word,
//  - a single event can belong to several people ("Kita Miri/Lars"),
//  - one-letter names are ignored; too many false positives.

import type { CachedEvent, Person } from './types.ts';

/** Lowercase, strip diacritics, ß → ss. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The normalized needles that identify a person. */
export function matchersFor(person: Person): string[] {
  const raw = [person.name, person.shortName ?? '', ...(person.aliases ?? [])];
  const seen = new Set<string>();
  for (const candidate of raw) {
    const value = normalize(candidate).trim();
    // Two characters is the shortest useful abbreviation ("Ba", "Li").
    if (value.length >= 2) seen.add(value);
  }
  return [...seen];
}

const cache = new WeakMap<Person, RegExp | null>();

function personRegex(person: Person): RegExp | null {
  if (cache.has(person)) return cache.get(person)!;
  const matchers = matchersFor(person);
  const regex = matchers.length
    // Word boundaries by hand: \b would treat "ä" (already stripped) and "/"
    // inconsistently, and lookbehind keeps "Kita Miri/Lars" splitting right.
    ? new RegExp(`(?<![a-z0-9])(?:${matchers.map(escapeRegExp).join('|')})(?![a-z0-9])`, 'i')
    : null;
  cache.set(person, regex);
  return regex;
}

/** Ids of every person named in the text, in the family's column order. */
export function matchPeople(text: string, people: Person[]): string[] {
  const haystack = normalize(text);
  if (!haystack.trim()) return [];
  return people.filter(p => {
    const re = personRegex(p);
    return re ? re.test(haystack) : false;
  }).map(p => p.id);
}

/** Title + location + description, which is where names actually appear. */
export function eventText(event: Pick<CachedEvent, 'title' | 'location' | 'description'>): string {
  return [event.title, event.location, event.description].filter(Boolean).join(' \n ');
}

/**
 * Automatic assignment for a cached calendar event. Returns the ids of the
 * people it belongs to; an empty array means the shared "Familie" column.
 */
export function autoAssign(event: CachedEvent, people: Person[]): string[] {
  return matchPeople(eventText(event), people);
}
