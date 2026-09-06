// Read a time out of what someone typed into "Was?".
//
// The paper sheet writes times inside the line — "Zahnarzt 14-15", "Sport
// 16:10-16:55", "Waldspielgruppe 14 Uhr", "ab 15 daheim" — so the quick-add
// field accepts exactly that and pulls the time out of the title.
//
// The hard part is *not* recognising more formats; it is refusing to guess.
// "Zimmer 12", "KW 37", "3 Kinder" and "Lilly bis 16:00 Hort" must all stay
// plain titles, so a bare number only counts as a time when something marks it
// as one: minutes, "Uhr"/"h", am/pm, a leading "ab/um/von", or a range of two
// plausible daytime hours.

/** A time found inside a title, with the title it leaves behind. */
export type TitleTimes = {
  /** The title with the time expression removed and tidied up. */
  title: string;
  /** 24h "HH:MM" — the wire format of an <input type="time">. */
  startTime: string;
  /** Equal to startTime when only one time was given ("ab 14 Uhr"). */
  endTime: string;
  /** The text that was interpreted, so the UI can show what it understood. */
  source: string;
};

// hour, :minutes, "Uhr"/"h" (optionally followed by minutes), am/pm.
const CLOCK = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(?:(uhr|h)\b\.?(?:\s*(\d{2})(?!\d))?)?\s*(am|pm)?`;
const SEPARATOR = String.raw`\s*(?:-|–|—|bis|to|till|until)\s*`;
const PREFIX = String.raw`(?:\b(von|from|ab|um|at)\s+)?`;

const PATTERN = new RegExp(`${PREFIX}${CLOCK}(?:${SEPARATOR}${CLOCK})?`, 'gi');

// "bis 16:00" is an end, not a start — the planner has no way to store an open
// beginning, and on the paper sheet it reads as part of the text anyway.
const END_ONLY_BEFORE = /\b(bis|until|till|to)\s*$/i;

/** Hours below this only count as a time when something marks them as one. */
const PLAUSIBLE_DAY_START = 6;

type Clock = {
  hour: number;
  minutes: number;
  meridiem: 'am' | 'pm' | null;
  /** True when the text itself says this is a time. */
  marked: boolean;
};

function readClock(
  hour: string | undefined, minutes: string | undefined,
  marker: string | undefined, markerMinutes: string | undefined,
  meridiem: string | undefined
): Clock | null {
  if (hour === undefined) return null;
  const h = Number(hour);
  const m = Number(minutes ?? markerMinutes ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (m > 59) return null;
  const ap = meridiem ? (meridiem.toLowerCase() as 'am' | 'pm') : null;
  if (ap ? h < 1 || h > 12 : h > 23) return null;
  return { hour: h, minutes: m, meridiem: ap, marked: Boolean(minutes || marker || meridiem) };
}

function to24(clock: Clock, meridiem: 'am' | 'pm' | null): number {
  let h = clock.hour;
  if (meridiem === 'pm' && h < 12) h += 12;
  if (meridiem === 'am' && h === 12) h = 0;
  return h * 60 + clock.minutes;
}

function hhmm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Resolve a range's am/pm. When only one end carries a suffix it applies to
 * both — except where that would run backwards: "11-1pm" is 11:00–13:00, not
 * 23:00–13:00.
 */
function resolveRange(start: Clock, end: Clock): { start: number; end: number } | null {
  const startAp = start.meridiem ?? end.meridiem;
  const endAp = end.meridiem ?? start.meridiem;

  let startMinutes = to24(start, startAp);
  const endMinutes = to24(end, endAp);

  if (startMinutes > endMinutes && !start.meridiem && end.meridiem) {
    const flipped = to24(start, end.meridiem === 'pm' ? 'am' : 'pm');
    if (flipped <= endMinutes) startMinutes = flipped;
  }

  // A range that still runs backwards means midnight is involved, which a
  // day-shaped planner entry cannot express — keep the start, drop the end.
  if (endMinutes < startMinutes) return null;
  return { start: startMinutes, end: endMinutes };
}

function tidyTitle(raw: string, from: number, length: number): string {
  const rest = `${raw.slice(0, from)} ${raw.slice(from + length)}`;
  return rest
    .replace(/\(\s*\)|\[\s*\]/g, ' ')          // brackets the time left empty
    .replace(/\s+([,;.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:·\-–—]+|[\s,;:·\-–—]+$/g, '')
    .trim();
}

/**
 * Returns the times hidden in `raw`, or null when there is nothing to read —
 * including the case where the title would be left empty (someone typed only
 * a time; the entry still needs a name).
 */
export function parseTitleTime(raw: string): TitleTimes | null {
  const text = raw ?? '';
  if (!text.trim()) return null;

  PATTERN.lastIndex = 0;
  for (const match of text.matchAll(PATTERN)) {
    const index = match.index ?? 0;
    if (END_ONLY_BEFORE.test(text.slice(0, index))) continue;

    const [, prefix, h1, m1, mark1, markMin1, ap1, h2, m2, mark2, markMin2, ap2] = match;
    const start = readClock(h1, m1, mark1, markMin1, ap1);
    if (!start) continue;
    const end = readClock(h2, m2, mark2, markMin2, ap2);

    // German dates share the dot notation: "1.10." is the first of October,
    // not ten past one. A trailing dot gives it away — and only for a single
    // clock, since "16.10-16.55" is unmistakably a range of times.
    if (!end && /\d\.\d{2}/.test(match[0]) && text[index + match[0].length] === '.') continue;

    let startMinutes: number;
    let endMinutes: number;

    if (end) {
      // A bare range ("14-15") is only a time when both ends read as daytime
      // hours; that is what keeps "Zimmer 3-5" a room number.
      const marked = start.marked || end.marked || Boolean(prefix);
      if (!marked && (start.hour < PLAUSIBLE_DAY_START || end.hour < PLAUSIBLE_DAY_START)) continue;
      const range = resolveRange(start, end);
      if (range) {
        startMinutes = range.start;
        endMinutes = range.end;
      } else {
        startMinutes = to24(start, start.meridiem);
        endMinutes = startMinutes;
      }
    } else {
      if (!start.marked && !prefix) continue;
      startMinutes = to24(start, start.meridiem);
      endMinutes = startMinutes;
    }

    const title = tidyTitle(text, index, match[0].length);
    if (!title) continue;

    return {
      title,
      startTime: hhmm(startMinutes),
      endTime: hhmm(endMinutes),
      source: match[0].trim(),
    };
  }

  return null;
}

/**
 * Drop a time from a title when the chip already shows it beside the text.
 *
 * Calendar entries often repeat their own time — "GM schaut auf Lars
 * 8:00-13:00" — and in a narrow column that turns one line into three for no
 * information at all. Only an exact match goes: a *different* time in the
 * title ("Abgabe bis 16:00" on a 9–17 entry) is something the reader needs.
 *
 * Times come in as "HH:MM", the shape timeValue() produces, so this stays free
 * of time zones.
 */
export function stripRedundantTime(
  title: string, startTime: string | null, endTime: string | null
): string {
  if (!title || !startTime) return title;
  const found = parseTitleTime(title);
  if (!found || found.startTime !== startTime) return title;
  // A title naming only a start ("ab 8:00") repeats itself in both fields.
  const endMatches = found.endTime === found.startTime || found.endTime === endTime;
  if (!endMatches) return title;
  return found.title || title;
}
