// Read a repetition out of what someone typed into "Was?".
//
// The counterpart to parseTitleTime: "Kita jeden Freitag 8-16" should set the
// series and the time in one go, so this runs first and hands the rest of the
// line on to the time parser.
//
// Same discipline as the time parser — the job is to refuse politely.
// "Montagsmarkt" and "Freitagsverkauf" are words, not patterns, and a bare
// "Freitag Zahnarzt" names one day rather than a series: only an explicit
// "jeden …", a "-s" plural ("freitags") or "alle n Wochen" counts.

import type { RepeatRule } from './recurrence.ts';

/** A repetition found inside a title, with the title it leaves behind. */
export type TitleRepeat = {
  title: string;
  repeat: RepeatRule;
  /** The text that was interpreted, so the UI can show what it understood. */
  source: string;
};

// 0 = Sunday … 6 = Saturday, matching Date#getUTCDay() and the DB column.
const WEEKDAYS: { pattern: string; day: number }[] = [
  { pattern: 'sonntags?|so\\.?|sundays?|sun\\.?', day: 0 },
  { pattern: 'montags?|mo\\.?|mondays?|mon\\.?', day: 1 },
  { pattern: 'dienstags?|di\\.?|tuesdays?|tue\\.?', day: 2 },
  { pattern: 'mittwochs?|mi\\.?|wednesdays?|wed\\.?', day: 3 },
  { pattern: 'donnerstags?|do\\.?|thursdays?|thu\\.?', day: 4 },
  { pattern: 'freitags?|fr\\.?|fridays?|fri\\.?', day: 5 },
  { pattern: 'samstags?|sonnabends?|sa\\.?|saturdays?|sat\\.?', day: 6 },
];

const ANY_WEEKDAY = WEEKDAYS.map(w => w.pattern).join('|');
const JOIN = String.raw`\s*(?:,|\+|&|und|and|sowie)\s*`;

// "jeden Freitag", "jeden 2. Freitag", "jeden Montag und Donnerstag",
// "every Friday", "jeden Fr, Do"
const EVERY_WEEKDAY = new RegExp(
  // Ends on a lookahead rather than \b so an abbreviation keeps its dot:
  // "jeden Di." must swallow the dot instead of leaving it in the title.
  String.raw`\b(?:jede[nrs]?|alle|every|each)\s+(?:(\d{1,2})\.?\s*)?(?:woche\s+)?((?:${ANY_WEEKDAY})(?:${JOIN}(?:${ANY_WEEKDAY}))*)\.?(?![a-zäöüß0-9])`,
  'i'
);

// "freitags", "montags und donnerstags" — the German plural is a pattern by
// itself, so no "jeden" is needed.
const PLURAL_WEEKDAY = new RegExp(
  String.raw`\b((?:(?:sonntags|montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonnabends))(?:${JOIN}(?:sonntags|montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonnabends))*)\b`,
  'i'
);

// "jede Woche", "wöchentlich", "alle 2 Wochen", "every 3 weeks", "weekly"
const EVERY_WEEK = new RegExp(
  String.raw`\b(?:(?:jede[nrs]?|alle|every|each)\s+(?:(\d{1,2})\.?\s*)?(?:wochen?|weeks?)|wöchentlich|woechentlich|weekly)\b`,
  'i'
);

function weekdayOf(word: string): number | null {
  const clean = word.trim().toLowerCase().replace(/\.$/, '');
  for (const { pattern, day } of WEEKDAYS) {
    if (new RegExp(`^(?:${pattern})$`, 'i').test(clean)) return day;
  }
  return null;
}

function readWeekdays(list: string): number[] {
  const days = new Set<number>();
  for (const word of list.split(/,|\+|&|\bund\b|\band\b|\bsowie\b/i)) {
    const day = weekdayOf(word);
    if (day !== null) days.add(day);
  }
  return [...days];
}

function tidy(raw: string, from: number, length: number): string {
  return `${raw.slice(0, from)} ${raw.slice(from + length)}`
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+([,;.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:·\-–—]+|[\s,;:·\-–—]+$/g, '')
    .trim();
}

function clampInterval(raw: string | undefined): number {
  const value = Number(raw ?? 1);
  return Number.isFinite(value) && value >= 1 && value <= 12 ? Math.floor(value) : 1;
}

/**
 * Returns the repetition hidden in `raw`, or null when there is none — or when
 * removing it would leave the title empty (an entry still needs a name).
 *
 * `weekdays` is empty for a bare "jede Woche"; the caller fills in the weekday
 * of the chosen start date, which is what "jede Woche" means on a planner.
 */
export function parseTitleRepeat(raw: string): TitleRepeat | null {
  const text = raw ?? '';
  if (!text.trim()) return null;

  const attempts: { match: RegExpMatchArray | null; weekdays: (m: RegExpMatchArray) => number[] }[] = [
    { match: text.match(EVERY_WEEKDAY), weekdays: m => readWeekdays(m[2]) },
    { match: text.match(PLURAL_WEEKDAY), weekdays: m => readWeekdays(m[1]) },
    { match: text.match(EVERY_WEEK), weekdays: () => [] },
  ];

  for (const attempt of attempts) {
    const match = attempt.match;
    if (!match || match.index === undefined) continue;

    const weekdays = attempt.weekdays(match);
    // A "jeden …" that names nothing recognisable is not a pattern.
    if (weekdays.length === 0 && attempt !== attempts[2]) continue;

    const title = tidy(text, match.index, match[0].length);
    if (!title) continue;

    return {
      title,
      repeat: {
        freq: 'weekly',
        interval: clampInterval(match[1]),
        weekdays,
        until: null,
      },
      source: match[0].trim(),
    };
  }

  return null;
}
