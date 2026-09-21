import { describe, expect, it } from 'vitest';
import {
  MAX_ITEMS, buildPrompt, validateList,
} from '../supabase/functions/family-destination-list/list.ts';

describe('the brief', () => {
  const prompt = buildPrompt('  Hauptstädte in Europa ');

  it('passes the description through as it was meant', () => {
    expect(prompt).toContain('Hauptstädte in Europa');
  });

  it('insists on completeness where a list has a fixed size', () => {
    expect(prompt).toMatch(/alle 26 Kantone, alle 16 Bundesländer/);
  });

  it('would rather have a short right list than a complete-looking wrong one', () => {
    expect(prompt).toMatch(/lass ihn weg/);
    expect(prompt).toMatch(/Keine erfundenen Einträge/);
  });

  it('asks for German spellings and a readable order', () => {
    expect(prompt).toContain('„Genf“, nicht „Genève“');
    expect(prompt).toMatch(/Sortiere so, wie man die Liste lesen würde/);
  });

  it('says what to do when the description is not a list of places', () => {
    expect(prompt).toMatch(/gib items leer zurück/);
  });
});

describe('what is kept of the answer', () => {
  const answer = {
    group: 'Bundesländer',
    note: '',
    items: [{ name: 'Bayern', code: 'BY' }, { name: 'Hessen', code: 'HE' }],
  };

  it('keeps a well-formed list as it is', () => {
    expect(validateList(answer, 'egal')).toEqual({
      group: 'Bundesländer', note: '',
      items: [{ name: 'Bayern', code: 'BY' }, { name: 'Hessen', code: 'HE' }],
    });
  });

  it('drops an entry without a name, and lists a place once', () => {
    const messy = { ...answer, items: [
      { name: '   ' }, { name: 'Bayern', code: 'BY' }, { name: 'BAYERN' }, null, 42,
    ] };
    expect(validateList(messy, 'egal').items).toEqual([{ name: 'Bayern', code: 'BY' }]);
  });

  it('lets a code be missing rather than invented', () => {
    const [kept] = validateList({ ...answer, items: [{ name: 'Toskana' }] }, 'egal').items;
    expect(kept).toEqual({ name: 'Toskana', code: null });
  });

  it('falls back to the description when the model names nothing', () => {
    expect(validateList({ items: answer.items }, 'Grosse Städte').group).toBe('Grosse Städte');
    expect(validateList({}, '').group).toBe('Ziele');
  });

  it('caps a runaway list', () => {
    const many = { items: Array.from({ length: 300 }, (_, i) => ({ name: `Ort ${i}` })) };
    expect(validateList(many, 'egal').items).toHaveLength(MAX_ITEMS);
  });

  it('comes back empty rather than guessing, and keeps the reason', () => {
    const refusal = { group: '', items: [], note: 'Das ist keine Liste von Orten.' };
    const kept = validateList(refusal, 'Lieblingsfarben');
    expect(kept.items).toEqual([]);
    expect(kept.note).toBe('Das ist keine Liste von Orten.');
  });

  it('has nothing to say about nonsense', () => {
    expect(validateList(null, 'Ziele').items).toEqual([]);
    expect(validateList({ items: 'nope' }, 'Ziele').items).toEqual([]);
  });

  it('tidies whitespace out of what it keeps', () => {
    const kept = validateList({ items: [{ name: '  Sankt \n Gallen ', code: ' SG ' }] }, 'x');
    expect(kept.items[0]).toEqual({ name: 'Sankt Gallen', code: 'SG' });
  });
});
