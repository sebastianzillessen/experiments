// What a generated list is asked for, and what is kept of it.
//
// Free of the SDK on purpose, so the vitest suite can check both halves. The
// function does not write anything: it proposes a list, the family ticks what
// it wants, and the client writes that. A list nobody looked at is exactly the
// kind of thing that quietly fills a screen with places that do not exist.

export type ListItem = { name: string; code: string | null };
export type GeneratedList = { group: string; items: ListItem[]; note: string };

export const MAX_ITEMS = 100;

/**
 * The brief.
 *
 * Two things it has to get right — real places, and all of them when the list
 * has a fixed size (there are 16 Bundesländer, not 15) — and one it must not
 * do: pad the list to look complete. A made-up entry survives right up to the
 * moment somebody drives there.
 */
export function buildPrompt(request: string): string {
  return [
    `Eine Familie will eine Liste von Reisezielen abarbeiten und beschreibt sie so: „${request.trim()}“.`,
    '',
    'Gib diese Liste zurück:',
    '- group: ein kurzer Name für die Liste, wie er als Überschrift taugt („Hauptstädte Europas“, „Bundesländer“)',
    '- items: die Einträge, jeder mit name und optional code',
    '- code: ein Kürzel von 1 bis 4 Zeichen, wenn es ein übliches gibt (Kantonskürzel, Autokennzeichen, Länderkürzel). Sonst weglassen.',
    '- note: ein Satz, falls es etwas zu sagen gibt — etwa dass du gekürzt hast oder dass die Abgrenzung Ansichtssache ist. Sonst leer.',
    '',
    'Regeln:',
    '- Wenn die Liste eine feste Grösse hat, gib sie vollständig zurück: alle 26 Kantone, alle 16 Bundesländer, alle Länder.',
    '- Keine erfundenen Einträge. Wenn du bei einem unsicher bist, lass ihn weg — eine kürzere richtige Liste ist besser als eine vollständig aussehende mit einem Fehler darin.',
    `- Höchstens ${MAX_ITEMS} Einträge. Ergäbe die Beschreibung mehr, nimm die bekanntesten und schreib das in note.`,
    '- Namen auf Deutsch, in der Schreibweise, die hier üblich ist („Genf“, nicht „Genève“; „Mailand“, nicht „Milano“).',
    '- Sortiere so, wie man die Liste lesen würde: alphabetisch, oder nach Grösse, wenn das die Beschreibung nahelegt.',
    '- Ergibt die Beschreibung keine Liste von Orten, gib items leer zurück und schreib in note, warum.',
  ].join('\n');
}

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

/** Keep what is usable. An entry without a name is not an entry. */
export function validateList(raw: unknown, fallbackGroup: string): GeneratedList {
  const data = (raw ?? {}) as { group?: unknown; items?: unknown; note?: unknown };
  const items: ListItem[] = [];
  const seen = new Set<string>();

  for (const entry of Array.isArray(data.items) ? data.items : []) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const name = clean(item.name, 80);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const code = clean(item.code, 4);
    items.push({ name, code: code || null });
    if (items.length >= MAX_ITEMS) break;
  }

  return {
    group: clean(data.group, 60) || fallbackGroup.slice(0, 60) || 'Ziele',
    items,
    note: clean(data.note, 300),
  };
}
