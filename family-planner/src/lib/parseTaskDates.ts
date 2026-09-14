// Reading a list of dates the way people actually send one.
//
// Some household work does not have a rhythm, it has an appointment list: the
// cleaner writes "here the complete list for the upcoming months" and then
// fifteen lines of "Sat, Oct 3". Turning that into "roughly every eleven days"
// throws away the only thing that matters, so it is kept as the days it is.
//
// The parser is deliberately forgiving — WhatsApp lists arrive with bullets,
// bold and italic markers, invisible characters from the copy, English and
// German month names in the same message — and deliberately unsure of itself:
// it proposes, the person confirms. A line it cannot read is shown as
// unreadable rather than dropped, and a weekday that does not match its date
// is flagged instead of silently corrected, because that is usually a typo in
// the message and worth a second look before someone drives over.

const MONTHS: Record<string, number> = {
  jan: 1, januar: 1, january: 1, jaenner: 1,
  feb: 2, februar: 2, february: 2,
  mar: 3, mrz: 3, maerz: 3, march: 3, marz: 3,
  apr: 4, april: 4,
  mai: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, october: 10,
  nov: 11, november: 11,
  dez: 12, dec: 12, dezember: 12, december: 12,
};

const WEEKDAYS: Record<string, number> = {
  mo: 1, mon: 1, montag: 1, monday: 1,
  di: 2, die: 2, tue: 2, tues: 2, dienstag: 2, tuesday: 2,
  mi: 3, mit: 3, wed: 3, mittwoch: 3, wednesday: 3,
  do: 4, don: 4, thu: 4, thur: 4, thurs: 4, donnerstag: 4, thursday: 4,
  fr: 5, fre: 5, fri: 5, freitag: 5, friday: 5,
  sa: 6, sam: 6, sat: 6, samstag: 6, saturday: 6, sonnabend: 6,
  so: 7, son: 7, sun: 7, sonntag: 7, sunday: 7,
};

export type ParsedLine = {
  /** The line as it was, minus bullets and emphasis markers. */
  text: string;
  /** "YYYY-MM-DD", or null when there is no date in the line. */
  date: string | null;
  /** *bold* usually marks what is new, _italic_ something not settled. */
  emphasis: 'bold' | 'italic' | null;
  /** The line named a weekday, and it is not the weekday of that date. */
  weekdayMismatch: boolean;
  /** Whether to book this one — italic and mismatches want a look first. */
  suggested: boolean;
};

/** Zero-width and formatting characters a copied message is full of. */
const INVISIBLE = /[­​-‏⁠﻿]/g;

const pad = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Is this a real day? September 31 is a typo, not a date. */
function valid(y: number, m: number, d: number): boolean {
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/**
 * A list without years means the months ahead, with the last few weeks still
 * in reach — the message above starts a week in the past. Anything older than
 * that belongs to next year.
 */
function pickYear(month: number, day: number, today: Date): number {
  const year = today.getUTCFullYear();
  const guess = Date.UTC(year, month - 1, day);
  const cutoff = today.getTime() - 60 * 86_400_000;
  if (guess >= cutoff) return year;
  return year + 1;
}

const monthOf = (word: string): number | null => {
  const w = word.toLowerCase().replace(/[.†]/g, '').replace(/ä/g, 'ae').replace(/[^a-z]/g, '');
  return MONTHS[w] ?? null;
};

function findDate(text: string, today: Date): string | null {
  // ISO first: unambiguous, and a paste from a calendar looks like this.
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    return valid(y, m, d) ? key(y, m, d) : null;
  }

  // 15.10. / 15.10.2026 / 15. 10. 26
  const numeric = text.match(/\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})?/);
  if (numeric) {
    const d = Number(numeric[1]);
    const m = Number(numeric[2]);
    const raw = numeric[3];
    const y = raw ? (raw.length === 2 ? 2000 + Number(raw) : Number(raw)) : pickYear(m, d, today);
    return valid(y, m, d) ? key(y, m, d) : null;
  }

  // 7. September 2026 / 7 Sept — every candidate is tried, because the first
  // word after a number is not always the month ("ab 3 Uhr morgens").
  for (const m of text.matchAll(/\b(\d{1,2})\.?\s+([A-Za-zÄÖÜäöü]{3,12})\.?(?:\s+(\d{4}))?/g)) {
    const month = monthOf(m[2]);
    if (!month) continue;
    const d = Number(m[1]);
    const y = m[3] ? Number(m[3]) : pickYear(month, d, today);
    if (valid(y, month, d)) return key(y, month, d);
  }

  // Sept 7 / Oct 3rd, 2026
  for (const m of text.matchAll(/\b([A-Za-zÄÖÜäöü]{3,12})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/g)) {
    const month = monthOf(m[1]);
    if (!month) continue;
    const d = Number(m[2]);
    const y = m[3] ? Number(m[3]) : pickYear(month, d, today);
    if (valid(y, month, d)) return key(y, month, d);
  }
  return null;
}

/** The weekday a line claims, if it names one at the start. */
function claimedWeekday(text: string): number | null {
  const first = text.match(/^[^\p{L}]*(\p{L}{2,12})/u);
  if (!first) return null;
  const w = first[1].toLowerCase().replace(/ä/g, 'ae').replace(/[^a-z]/g, '');
  return WEEKDAYS[w] ?? null;
}

/** 1 = Monday … 7 = Sunday, for a "YYYY-MM-DD". */
export function weekdayOfKey(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Read a pasted message into one entry per line that looks like a date.
 * Lines without a date (a greeting, "Rest of October is still pretty empty")
 * are left out entirely; a line that has a date but cannot be trusted comes
 * back with `suggested: false` rather than being decided for the reader.
 */
export function parseTaskDates(input: string, now: Date = new Date()): ParsedLine[] {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const seen = new Set<string>();
  const out: ParsedLine[] = [];

  for (const rawLine of input.replace(INVISIBLE, '').split(/\r?\n/)) {
    let text = rawLine.trim();
    if (!text) continue;

    // Bullets come as -, –, •, or a lone * used as one.
    text = text.replace(/^[-–—•●▪]+\s*/, '').trim();
    if (/^\*[^*]/.test(text) && !/\*$/.test(text)) text = text.replace(/^\*\s*/, '').trim();

    let emphasis: ParsedLine['emphasis'] = null;
    const bold = text.match(/^\*{1,2}(.+?)\*{1,2}$/);
    const italic = text.match(/^_(.+?)_$/);
    if (bold) { emphasis = 'bold'; text = bold[1].trim(); }
    else if (italic) { emphasis = 'italic'; text = italic[1].trim(); }

    const date = findDate(text, today);
    if (!date) continue;
    if (seen.has(date)) continue;
    seen.add(date);

    const claimed = claimedWeekday(text);
    const weekdayMismatch = claimed !== null && claimed !== weekdayOfKey(date);
    out.push({
      text,
      date,
      emphasis,
      weekdayMismatch,
      // Italic is how people mark what is not settled — in the message this
      // was written for, the italic line is one the cleaner had declined.
      suggested: emphasis !== 'italic' && !weekdayMismatch,
    });
  }

  return out.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}
