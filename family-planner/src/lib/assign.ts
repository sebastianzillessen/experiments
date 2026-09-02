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

/**
 * Remove the people's own names from an event's text.
 *
 * A calendar entry says who it is for — "Caro LQ", "[Caro] Reitstunde",
 * "Kita Miri/Lars" — but once it sits in Caro's column that word is noise.
 * The column already answers "who", so the chip only has to answer "what".
 * Matching is the same as autoAssign(): whole words, case- and
 * diacritic-insensitive, and multi-word aliases ("Oma Meier") count as one.
 *
 * Returns the original text unchanged when nothing matches, and also when
 * stripping would leave nothing behind — an entry titled just "Caro" keeps
 * its name rather than becoming an empty chip.
 */
export function stripPeopleNames(text: string, people: Person[]): string {
  if (!text || people.length === 0) return text;

  const matchers = new Set<string>();
  let longest = 1;
  for (const person of people) {
    for (const matcher of matchersFor(person)) {
      matchers.add(matcher);
      longest = Math.max(longest, matcher.split(/\s+/).length);
    }
  }
  if (matchers.size === 0) return text;

  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map(m => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    normalized: normalize(m[0]),
  }));

  // Longest first, so "Oma Meier" wins over a bare "Oma".
  const consumed = new Set<number>();
  const cuts: { start: number; end: number }[] = [];
  for (let size = longest; size >= 1; size--) {
    for (let i = 0; i + size <= words.length; i++) {
      let free = true;
      for (let k = 0; k < size && free; k++) free = !consumed.has(i + k);
      if (!free) continue;
      const phrase = words.slice(i, i + size).map(w => w.normalized).join(' ');
      if (!matchers.has(phrase)) continue;
      cuts.push({ start: words[i].start, end: words[i + size - 1].end });
      for (let k = 0; k < size; k++) consumed.add(i + k);
    }
  }
  if (cuts.length === 0) return text;

  // Two names next to each other ("Lars und Miriam", "Miri/Lars", "Caro +
  // Basti") are one span: take the word joining them along with the names,
  // otherwise the conjunction is left stranded mid-sentence.
  cuts.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const cut of cuts) {
    const previous = merged[merged.length - 1];
    if (previous && JOINER.test(text.slice(previous.end, cut.start))) {
      previous.end = cut.end;
    } else {
      merged.push({ ...cut });
    }
  }

  let stripped = text;
  for (const cut of merged.reverse()) {
    stripped = `${stripped.slice(0, cut.start)} ${stripped.slice(cut.end)}`;
  }

  const tidied = tidyLeftovers(stripped);
  return tidied || text;
}

/** What may sit between two names and still be part of the same enumeration. */
const JOINER = /^\s*(?:und|and|u\.|&|\+|,|\/|·|-|–|—|\bmit\b|\bwith\b)\s*$/i;

/** Clean up the brackets, slashes and conjunctions a removed name leaves behind. */
function tidyLeftovers(text: string): string {
  return text
    .replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, ' ')
    .replace(/\s+([,;.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s/+&,;:·\-–—]+|[\s/+&,;:·\-–—]+$/g, '')
    .replace(/^(?:und|and|mit|with|u\.)\s+|\s+(?:und|and|mit|with|u\.)$/gi, '')
    .replace(/^[\s/+&,;:·\-–—]+|[\s/+&,;:·\-–—]+$/g, '')
    .trim();
}

/**
 * Words from an event that could become an alias for a person — everything
 * that is not already a known name. Offered as chips when someone moves an
 * entry to the right person by hand, so "Lillian Mittagessen Hort" only has
 * to be corrected once.
 *
 * Deliberately not guessed: the app cannot tell "Lillian" from "Mittagessen",
 * so it lists both and lets the person pick.
 */
export function aliasCandidates(text: string, people: Person[], limit = 8): string[] {
  const known = new Set<string>();
  for (const person of people) for (const matcher of matchersFor(person)) known.add(matcher);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(/[\p{L}][\p{L}\-']*/gu)) {
    const word = match[0];
    if (word.length < 3) continue;
    const key = normalize(word);
    if (known.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= limit) break;
  }
  return out;
}
