import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_IDEAS, buildPrompt, validateIdeas } from '../supabase/functions/family-trip-ideas/ideas.ts';
import { CANTONS } from '../src/lib/cantons.ts';

describe('the brief', () => {
  const prompt = buildPrompt('Graubünden', '', null);

  it('names the canton and asks for a mix of lengths', () => {
    expect(prompt).toContain('Kanton Graubünden');
    expect(prompt).toContain('Tagesausflüge');
    expect(prompt).toContain('zwei Tage');
  });

  it('tells it to leave out what it is unsure of', () => {
    expect(prompt).toMatch(/nicht sicher bist, lass ihn weg/);
    expect(prompt).toContain('wirklich im Kanton Graubünden liegen');
  });

  it('forbids the things that go stale', () => {
    expect(prompt).toContain('Keine Öffnungszeiten, keine Preise');
  });

  it('mentions the postal code only when there is one', () => {
    expect(prompt).not.toMatch(/Postleitzahl/);
    expect(buildPrompt('Uri', '', '8134')).toContain('Postleitzahl 8134');
  });

  it('passes the family\'s own wishes through', () => {
    const withWishes = buildPrompt('Uri', 'mit Kinderwagen, max. 2 h Fahrt', null);
    expect(withWishes).toContain('mit Kinderwagen, max. 2 h Fahrt');
  });
});

describe('what is kept of the answer', () => {
  const idea = (extra: Record<string, unknown> = {}) => ({
    title: 'Rheinfall', summary: 'Der grösste Wasserfall Europas.',
    highlights: ['Bootsfahrt zum Felsen', 'Schloss Laufen'],
    duration: 'tag', season: 'im Sommer', travel: 'mit dem Zug nach Neuhausen',
    ...extra,
  });

  it('keeps a well-formed suggestion as it is', () => {
    expect(validateIdeas({ ideas: [idea()] })).toEqual([{
      title: 'Rheinfall', summary: 'Der grösste Wasserfall Europas.',
      highlights: ['Bootsfahrt zum Felsen', 'Schloss Laufen'],
      duration: 'tag', season: 'im Sommer', travel: 'mit dem Zug nach Neuhausen',
    }]);
  });

  it('drops a suggestion without a name — that is not a suggestion', () => {
    expect(validateIdeas({ ideas: [idea({ title: '   ' }), idea()] })).toHaveLength(1);
  });

  it('lets the softer fields be empty rather than invented', () => {
    const [kept] = validateIdeas({ ideas: [idea({ season: undefined, travel: null })] });
    expect(kept.season).toBe('');
    expect(kept.travel).toBe('');
  });

  it('treats anything but the two lengths as a day trip', () => {
    expect(validateIdeas({ ideas: [idea({ duration: 'woche' })] })[0].duration).toBe('tag');
    expect(validateIdeas({ ideas: [idea({ duration: 'zwei-tage' })] })[0].duration).toBe('zwei-tage');
  });

  it('lists the same place once', () => {
    expect(validateIdeas({ ideas: [idea(), idea({ title: 'RHEINFALL' })] })).toHaveLength(1);
  });

  it('caps the list and the highlights', () => {
    const many = Array.from({ length: 9 }, (_, i) => idea({
      title: `Ort ${i}`, highlights: ['a', 'b', 'c', 'd', 'e', 'f'],
    }));
    const kept = validateIdeas({ ideas: many });
    expect(kept).toHaveLength(MAX_IDEAS);
    expect(kept[0].highlights).toHaveLength(4);
  });

  it('has nothing to say about nonsense', () => {
    expect(validateIdeas(null)).toEqual([]);
    expect(validateIdeas({ ideas: 'nope' })).toEqual([]);
    expect(validateIdeas({ ideas: [42, null] })).toEqual([]);
  });

  it('tidies whitespace out of what it keeps', () => {
    const [kept] = validateIdeas({ ideas: [idea({ title: '  Rheinfall \n bei Schaffhausen ' })] });
    expect(kept.title).toBe('Rheinfall bei Schaffhausen');
  });
});

describe('the canton list in the function', () => {
  it('matches the one the app uses', () => {
    // The Edge Function cannot import from src/, so it carries its own copy.
    // This is the check that keeps the two from drifting apart.
    const source = readFileSync(
      new URL('../supabase/functions/family-trip-ideas/index.ts', import.meta.url), 'utf8'
    );
    const block = source.slice(source.indexOf('const CANTONS'), source.indexOf('};', source.indexOf('const CANTONS')));
    const pairs = [...block.matchAll(/([A-Z]{2}): '([^']+)'/g)].map(m => [m[1], m[2]]);
    expect(Object.fromEntries(pairs)).toEqual(
      Object.fromEntries(CANTONS.map(c => [c.code, c.name]))
    );
  });
});
