// What the model is asked for, and what is kept of its answer.
//
// Free of the SDK on purpose, so the vitest suite can check both halves: the
// prompt is the feature, and the validation is what stands between a confident
// sentence and a family driving somewhere that is in the wrong canton.

export type TripIdea = {
  title: string;
  summary: string;
  highlights: string[];
  duration: 'tag' | 'zwei-tage';
  season: string;
  travel: string;
};

export const MAX_IDEAS = 5;
const MAX_HIGHLIGHTS = 4;

/**
 * The brief.
 *
 * Three things it has to get right — real places, in this canton, worth the
 * drive with children — and three it must not do: invent a place, quote
 * anything that goes stale (opening hours, prices, what a ticket costs), or
 * hand back five variations of the same afternoon. The honesty rule is the
 * same one the menu importer uses: a shorter list is fine, a made-up entry
 * is not, because nobody checks a plausible sentence until they are standing
 * in the car park.
 */
export function buildPrompt(cantonName: string, wishes: string, plz: string | null): string {
  const lines = [
    `Wir sind eine Familie mit kleinen Kindern in der Schweiz und wollen dieses Jahr jeden Kanton mindestens einmal besuchen. Jetzt geht es um den Kanton ${cantonName}.`,
    '',
    `Schlag ${MAX_IDEAS} Ausflüge vor: mehrheitlich Tagesausflüge, ein bis zwei Vorschläge für zwei Tage mit einer Übernachtung.`,
    '',
    'Für jeden Vorschlag:',
    '- title: der Ort oder die Sache, kurz und konkret ("Rheinfall", nicht "Ein Ausflug ans Wasser")',
    '- summary: zwei Sätze, was man dort mit Kindern macht',
    '- highlights: zwei bis drei konkrete Dinge vor Ort',
    '- duration: "tag" oder "zwei-tage"',
    '- season: wann es sich lohnt, in wenigen Worten ("im Sommer", "ganzjährig", "bei Schnee")',
    '- travel: wie man hinkommt, in wenigen Worten (Auto, Zug, Bergbahn)',
    '',
    'Regeln:',
    `- Jeder Ort muss wirklich existieren und wirklich im Kanton ${cantonName} liegen. Wenn du dir bei einem Ort nicht sicher bist, lass ihn weg — vier gute Vorschläge sind besser als fünf, von denen einer erfunden ist.`,
    '- Keine Öffnungszeiten, keine Preise, keine Telefonnummern und keine Adressen. Das ändert sich, und falsche Angaben sind schlimmer als keine.',
    '- Fünf verschiedene Arten von Ausflug, nicht fünfmal dasselbe: Wasser, Berg, Tiere, Stadt, Museum, Bauernhof.',
    '- Deutsch, Schweizer Schreibweise: "ss" statt "ß".',
  ];
  if (plz) {
    lines.push(
      '',
      `Die Familie wohnt in der Postleitzahl ${plz}. Schreib bei travel dazu, wie weit es von dort ungefähr ist.`
    );
  }
  if (wishes.trim()) {
    lines.push('', `Zusätzliche Wünsche der Familie: ${wishes.trim()}`);
  }
  return lines.join('\n');
}

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

/**
 * Keep what is usable, drop what is not. An idea without a name is not an
 * idea, and the rest of the fields are allowed to be empty — the model saying
 * nothing about the season beats it making something up.
 */
export function validateIdeas(raw: unknown): TripIdea[] {
  const list = (raw as { ideas?: unknown[] })?.ideas;
  if (!Array.isArray(list)) return [];

  const out: TripIdea[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const title = clean(item.title, 120);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      title,
      summary: clean(item.summary, 600),
      highlights: (Array.isArray(item.highlights) ? item.highlights : [])
        .map(h => clean(h, 160))
        .filter(Boolean)
        .slice(0, MAX_HIGHLIGHTS),
      duration: item.duration === 'zwei-tage' ? 'zwei-tage' : 'tag',
      season: clean(item.season, 120),
      travel: clean(item.travel, 200),
    });
    if (out.length >= MAX_IDEAS) break;
  }
  return out;
}
