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

  it('asks for the journey time from home whenever home is known', () => {
    const fromZurich = buildPrompt('Uri', '', 'Zürich');
    expect(fromZurich).toContain('Die Familie startet in Zürich');
    expect(fromZurich).toMatch(/travel die ungefähre Fahrzeit ab Zürich nennen/);
    // And it says what to do with somewhere too far for a day.
    expect(fromZurich).toMatch(/zu weit weg ist, mach einen Zweitagesvorschlag/);
  });

  it('says nothing about a journey when there is no starting point', () => {
    expect(prompt).not.toMatch(/startet in/);
    expect(prompt).not.toMatch(/Fahrzeit ab/);
  });

  it('always asks for the means and the time', () => {
    expect(prompt).toContain('Verkehrsmittel und ungefähre Fahrzeit');
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

describe('when the API says no', () => {
  it('names an overload for what it is — nothing is broken, try again', async () => {
    const { apiErrorMessage } = await import('../supabase/functions/family-trip-ideas/ideas.ts');
    expect(apiErrorMessage(529, 'egal')).toMatch(/überlastet/);
    expect(apiErrorMessage(500, 'egal')).toMatch(/überlastet/);
    expect(apiErrorMessage(429, 'egal')).toMatch(/ausgelastet/);
  });

  it('says plainly when the key is the problem', async () => {
    const { apiErrorMessage } = await import('../supabase/functions/family-trip-ideas/ideas.ts');
    expect(apiErrorMessage(401, 'egal')).toMatch(/Schlüssel/);
  });

  it('keeps the fallback for anything it cannot explain', async () => {
    const { apiErrorMessage } = await import('../supabase/functions/family-trip-ideas/ideas.ts');
    expect(apiErrorMessage(400, 'Die Ideen konnten nicht geholt werden'))
      .toBe('Die Ideen konnten nicht geholt werden');
    expect(apiErrorMessage(undefined, 'Fallback')).toBe('Fallback');
  });
});

describe('turning a postal code into a place', () => {
  // Exactly what openplzapi.org answers for 8134: three entries, three
  // communes, one locality name.
  const answer = [
    { postalCode: '8134', name: 'Adliswil', commune: { key: '131', name: 'Adliswil' }, canton: { key: '1', name: 'Zürich', shortName: 'ZH' } },
    { postalCode: '8134', name: 'Adliswil', commune: { key: '13', name: 'Stallikon' }, canton: { key: '1', name: 'Zürich', shortName: 'ZH' } },
  ];

  it('reads the locality and its canton', async () => {
    const { localityFrom } = await import('../supabase/functions/family-trip-ideas/plz.ts');
    expect(localityFrom(answer)).toEqual({ name: 'Adliswil', canton: 'ZH' });
  });

  it('has nothing to say about an empty or malformed answer', async () => {
    const { localityFrom } = await import('../supabase/functions/family-trip-ideas/plz.ts');
    expect(localityFrom([])).toBeNull();
    expect(localityFrom(null)).toBeNull();
    expect(localityFrom([{ name: '  ' }])).toBeNull();
    expect(localityFrom({ name: 'Adliswil' })).toBeNull();
  });

  it('copes with a locality that has no canton on it', async () => {
    const { localityFrom } = await import('../supabase/functions/family-trip-ideas/plz.ts');
    expect(localityFrom([{ name: 'Adliswil' }])).toEqual({ name: 'Adliswil', canton: '' });
  });

  it('names the place when it knows it, and the code when it does not', async () => {
    const { originLabel } = await import('../supabase/functions/family-trip-ideas/plz.ts');
    expect(originLabel('8134', { name: 'Adliswil', canton: 'ZH' })).toBe('Adliswil ZH');
    expect(originLabel('8134', { name: 'Adliswil', canton: '' })).toBe('Adliswil');
    expect(originLabel('8134', null)).toBe('der Schweizer Postleitzahl 8134');
    expect(originLabel(null, null)).toBeNull();
  });

  it('gives up quietly when the directory does not answer', async () => {
    const { lookupPlz } = await import('../supabase/functions/family-trip-ideas/plz.ts');
    const failing = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect(await lookupPlz('8134', failing)).toBeNull();

    const notFound = (() => Promise.resolve(new Response('', { status: 404 }))) as unknown as typeof fetch;
    expect(await lookupPlz('9999', notFound)).toBeNull();
  });

  it('reads a real answer end to end', async () => {
    const { lookupPlz } = await import('../supabase/functions/family-trip-ideas/plz.ts');
    const ok = (() => Promise.resolve(Response.json(answer))) as unknown as typeof fetch;
    expect(await lookupPlz('8134', ok)).toEqual({ name: 'Adliswil', canton: 'ZH' });
  });
});
