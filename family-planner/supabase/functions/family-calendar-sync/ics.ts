// Dependency-free iCalendar (RFC 5545) reader: parse a VCALENDAR, expand
// recurrences into a date window, and hand back plain rows the planner can
// render. Deliberately free of any Deno/Node/browser API beyond `Intl` and
// `Date`, so the Edge Function and the vitest suite run the exact same code.
//
// Scope: what a family calendar (Google, Apple, Nextcloud, school feeds)
// actually emits — VEVENT with DTSTART/DTEND/DURATION, all-day dates, TZID
// wall-clock times, RRULE (DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT,
// UNTIL, BYDAY, BYMONTHDAY, BYMONTH), EXDATE and RECURRENCE-ID overrides.
// VTODO, VJOURNAL, VALARM and attendee handling are ignored on purpose.

export type IcsEvent = {
  /** iCalendar UID. Stable across syncs — the key for manual assignments. */
  uid: string;
  /** Local date of this occurrence's start (YYYY-MM-DD). Second half of the assignment key. */
  occurrence: string;
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  /** Inclusive local start/end day, the way a planner row reads. */
  startDate: string;
  endDate: string;
  /** ISO instants, null for all-day events. */
  startsAt: string | null;
  endsAt: string | null;
};

export type ExpandOptions = {
  /** Inclusive window in local dates, YYYY-MM-DD. */
  from: string;
  to: string;
  /** Zone for floating times and for bucketing instants into days. */
  tz: string;
  /** Safety valve against a pathological RRULE. */
  maxEvents?: number;
};

/** Wall-clock date/time plus the zone it is to be read in. */
type WallClock = {
  y: number; m: number; d: number;
  hh: number; mm: number; ss: number;
  /** null for all-day (date-only) values. */
  tz: string | null;
  allDay: boolean;
};

type RawProp = { value: string; params: Record<string, string> };

type RawEvent = {
  uid: string;
  summary: string;
  description: string;
  location: string;
  status: string;
  dtstart: RawProp | null;
  dtend: RawProp | null;
  duration: string | null;
  rrule: string | null;
  exdate: RawProp[];
  recurrenceId: RawProp | null;
};

const DAY_MS = 86_400_000;
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// ---------------------------------------------------------------------------
// Time zone helpers
// ---------------------------------------------------------------------------

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = offsetFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    offsetFormatters.set(tz, fmt);
  }
  return fmt;
}

/** The wall clock shown in `tz` at the given instant. */
export function wallClockIn(utcMs: number, tz: string): { y: number; m: number; d: number; hh: number; mm: number; ss: number } {
  const parts = partsFormatter(tz).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0');
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute'), ss: get('second') };
}

/** Zone offset in milliseconds (east of UTC positive) at the given instant. */
function offsetAt(utcMs: number, tz: string): number {
  const w = wallClockIn(utcMs, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss) - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Wall clock in a zone → UTC instant. Two passes converge everywhere except
 * inside a DST gap, where the later offset is used (same as most calendars).
 */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, ss: number, tz: string): number {
  const naive = Date.UTC(y, m - 1, d, hh, mm, ss);
  let utc = naive - offsetAt(naive, tz);
  utc = naive - offsetAt(utc, tz);
  return utc;
}

function pad2(n: number): string { return n < 10 ? '0' + n : String(n); }

export function toDateKey(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** YYYY-MM-DD → UTC-midnight ms, used for pure calendar-day arithmetic. */
export function dateKeyToMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDaysToKey(key: string, days: number): string {
  const dt = new Date(dateKeyToMs(key) + days * DAY_MS);
  return toDateKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function dateKeyIn(utcMs: number, tz: string): string {
  const w = wallClockIn(utcMs, tz);
  return toDateKey(w.y, w.m, w.d);
}

// ---------------------------------------------------------------------------
// Lexing
// ---------------------------------------------------------------------------

/** Undo RFC 5545 line folding (a continuation line starts with space or tab). */
export function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      out.push(line);
    }
  }
  return out;
}

function parseLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = indexOfUnquoted(line, ':');
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segments = splitUnquoted(head, ';');
  const name = (segments.shift() ?? '').toUpperCase();
  const params: Record<string, string> = {};
  for (const seg of segments) {
    const eq = seg.indexOf('=');
    if (eq < 0) continue;
    params[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

function indexOfUnquoted(s: string, ch: string): number {
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') quoted = !quoted;
    else if (!quoted && s[i] === ch) return i;
  }
  return -1;
}

function splitUnquoted(s: string, ch: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const c of s) {
    if (c === '"') { quoted = !quoted; cur += c; }
    else if (!quoted && c === ch) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Unescape TEXT values: \n \, \; \\ */
function unescapeText(v: string): string {
  return v.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Every VEVENT in the calendar, still in raw property form. */
export function parseIcs(text: string): RawEvent[] {
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;
  let depth = 0; // ignore properties of nested components (VALARM)

  for (const line of unfold(text)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;

    if (name === 'BEGIN') {
      const comp = value.toUpperCase();
      if (comp === 'VEVENT' && !cur) {
        cur = {
          uid: '', summary: '', description: '', location: '', status: '',
          dtstart: null, dtend: null, duration: null, rrule: null,
          exdate: [], recurrenceId: null
        };
      } else if (cur) {
        depth++;
      }
      continue;
    }
    if (name === 'END') {
      const comp = value.toUpperCase();
      if (comp === 'VEVENT' && cur && depth === 0) {
        if (cur.dtstart) events.push(cur);
        cur = null;
      } else if (cur && depth > 0) {
        depth--;
      }
      continue;
    }
    if (!cur || depth > 0) continue;

    switch (name) {
      case 'UID': cur.uid = value; break;
      case 'SUMMARY': cur.summary = unescapeText(value); break;
      case 'DESCRIPTION': cur.description = unescapeText(value); break;
      case 'LOCATION': cur.location = unescapeText(value); break;
      case 'STATUS': cur.status = value.toUpperCase(); break;
      case 'DTSTART': cur.dtstart = { value, params }; break;
      case 'DTEND': cur.dtend = { value, params }; break;
      case 'DURATION': cur.duration = value; break;
      case 'RRULE': cur.rrule = value; break;
      case 'EXDATE': cur.exdate.push({ value, params }); break;
      case 'RECURRENCE-ID': cur.recurrenceId = { value, params }; break;
      default: break;
    }
  }
  return events;
}

/** DTSTART/DTEND/EXDATE value → wall clock plus the zone to read it in. */
function parseWallClock(prop: RawProp, defaultTz: string): WallClock | null {
  const raw = prop.value.trim();
  const isDateOnly = prop.params.VALUE === 'DATE' || /^\d{8}$/.test(raw);
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (isDateOnly) {
    return { y: +y, m: +mo, d: +d, hh: 0, mm: 0, ss: 0, tz: null, allDay: true };
  }
  return {
    y: +y, m: +mo, d: +d, hh: +(hh ?? 0), mm: +(mm ?? 0), ss: +(ss ?? 0),
    tz: z ? 'UTC' : (prop.params.TZID || defaultTz),
    allDay: false
  };
}

function wallClockToUtc(w: WallClock, fallbackTz: string): number {
  const tz = w.tz ?? fallbackTz;
  return tz === 'UTC'
    ? Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss)
    : zonedToUtc(w.y, w.m, w.d, w.hh, w.mm, w.ss, tz);
}

/** ISO 8601 duration (P1DT2H30M) → milliseconds. */
export function parseDuration(value: string): number {
  const m = value.trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, sign, w, d, h, mi, s] = m;
  const ms = (Number(w ?? 0) * 7 + Number(d ?? 0)) * DAY_MS
    + Number(h ?? 0) * 3_600_000 + Number(mi ?? 0) * 60_000 + Number(s ?? 0) * 1000;
  return sign === '-' ? -ms : ms;
}

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

type Rule = {
  freq: string;
  interval: number;
  count: number | null;
  untilKey: string | null; // compared on local dates — good enough for a planner
  byDay: { ordinal: number | null; weekday: number }[];
  byMonthDay: number[];
  byMonth: number[];
};

export function parseRRule(value: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const seg of value.split(';')) {
    const eq = seg.indexOf('=');
    if (eq > 0) parts[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1);
  }
  const freq = (parts.FREQ || '').toUpperCase();
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;

  const byDay = (parts.BYDAY || '').split(',').filter(Boolean).map(token => {
    const m = token.trim().toUpperCase().match(/^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/);
    if (!m) return null;
    return { ordinal: m[1] ? Number(m[1]) : null, weekday: WEEKDAY_CODES.indexOf(m[2]) };
  }).filter((x): x is { ordinal: number | null; weekday: number } => x !== null);

  let untilKey: string | null = null;
  if (parts.UNTIL) {
    const m = parts.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) untilKey = toDateKey(+m[1], +m[2], +m[3]);
  }

  return {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL || 1)),
    count: parts.COUNT ? Number(parts.COUNT) : null,
    untilKey,
    byDay,
    byMonthDay: (parts.BYMONTHDAY || '').split(',').filter(Boolean).map(Number),
    byMonth: (parts.BYMONTH || '').split(',').filter(Boolean).map(Number)
  };
}

function weekdayOfKey(key: string): number {
  return new Date(dateKeyToMs(key)).getUTCDay();
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Local start dates generated by an RRULE, clipped to [windowFrom, windowTo].
 * Recurrence is computed on calendar days: a 14:00 event stays at 14:00 local
 * across a DST switch, which is what both RFC 5545 and a wall planner expect.
 */
export function expandRule(startKey: string, rule: Rule | null, windowFrom: string, windowTo: string, maxEvents: number): string[] {
  if (!rule) return startKey >= windowFrom && startKey <= windowTo ? [startKey] : [];

  const hardEnd = rule.untilKey && rule.untilKey < windowTo ? rule.untilKey : windowTo;
  const out: string[] = [];
  let emitted = 0; // counts every occurrence, including those before the window (COUNT semantics)
  let guard = 0;

  const emit = (key: string): boolean => {
    if (rule.untilKey && key > rule.untilKey) return false;
    if (key >= startKey) {
      emitted++;
      if (rule.count !== null && emitted > rule.count) return false;
      if (key >= windowFrom && key <= windowTo) out.push(key);
    }
    return out.length < maxEvents;
  };

  if (rule.freq === 'DAILY') {
    for (let key = startKey; key <= hardEnd && guard++ < 4000; key = addDaysToKey(key, rule.interval)) {
      if (key < windowFrom) {
        // Fast-forward without emitting rows, but keep COUNT honest.
        emitted++;
        if (rule.count !== null && emitted > rule.count) break;
        continue;
      }
      if (!emit(key)) break;
    }
    return out;
  }

  if (rule.freq === 'WEEKLY') {
    const weekdays = rule.byDay.length ? rule.byDay.map(b => b.weekday) : [weekdayOfKey(startKey)];
    // Monday-based week start: the planner and Swiss calendars both use it.
    const startOfWeek = (key: string) => addDaysToKey(key, -((weekdayOfKey(key) + 6) % 7));
    for (let week = startOfWeek(startKey); week <= hardEnd && guard++ < 2000; week = addDaysToKey(week, 7 * rule.interval)) {
      for (let offset = 0; offset < 7; offset++) {
        const key = addDaysToKey(week, offset);
        if (key < startKey || key > hardEnd) continue;
        if (!weekdays.includes(weekdayOfKey(key))) continue;
        if (!emit(key)) return out;
      }
    }
    return out;
  }

  if (rule.freq === 'MONTHLY') {
    const [sy, sm] = startKey.split('-').map(Number);
    const startDay = Number(startKey.split('-')[2]);
    for (let i = 0; guard++ < 800; i++) {
      const total = (sy * 12 + (sm - 1)) + i * rule.interval;
      const y = Math.floor(total / 12);
      const m = (total % 12) + 1;
      if (toDateKey(y, m, 1) > hardEnd) break;
      const days = candidateDaysInMonth(y, m, rule, startDay);
      for (const day of days) {
        const key = toDateKey(y, m, day);
        if (key < startKey || key > hardEnd) continue;
        if (!emit(key)) return out;
      }
    }
    return out;
  }

  // YEARLY
  const [sy, sm, sd] = startKey.split('-').map(Number);
  for (let i = 0; guard++ < 200; i++) {
    const y = sy + i * rule.interval;
    if (toDateKey(y, 1, 1) > hardEnd) break;
    const months = rule.byMonth.length ? rule.byMonth : [sm];
    for (const m of months) {
      const days = rule.byDay.length || rule.byMonthDay.length
        ? candidateDaysInMonth(y, m, rule, sd)
        : [Math.min(sd, daysInMonth(y, m))];
      for (const day of days) {
        const key = toDateKey(y, m, day);
        if (key < startKey || key > hardEnd) continue;
        if (!emit(key)) return out;
      }
    }
  }
  return out;
}

/** Days of one month selected by BYMONTHDAY / BYDAY (with ordinal), else the anchor day. */
function candidateDaysInMonth(y: number, m: number, rule: Rule, anchorDay: number): number[] {
  const total = daysInMonth(y, m);
  const days = new Set<number>();

  for (const md of rule.byMonthDay) {
    const day = md > 0 ? md : total + md + 1;
    if (day >= 1 && day <= total) days.add(day);
  }

  for (const { ordinal, weekday } of rule.byDay) {
    const matching: number[] = [];
    for (let day = 1; day <= total; day++) {
      if (new Date(Date.UTC(y, m - 1, day)).getUTCDay() === weekday) matching.push(day);
    }
    if (ordinal === null) matching.forEach(d => days.add(d));
    else {
      const picked = ordinal > 0 ? matching[ordinal - 1] : matching[matching.length + ordinal];
      if (picked) days.add(picked);
    }
  }

  if (days.size === 0 && anchorDay <= total) days.add(anchorDay);
  return [...days].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

/**
 * Parse a calendar and expand it into planner rows inside [from, to].
 * Cancelled events are dropped; RECURRENCE-ID components replace the single
 * occurrence they point at.
 */
export function expandIcs(text: string, opts: ExpandOptions): IcsEvent[] {
  const { from, to, tz } = opts;
  const maxEvents = opts.maxEvents ?? 5000;
  const raw = parseIcs(text);

  // uid → { occurrence date → override event }
  const overrides = new Map<string, Map<string, RawEvent>>();
  const masters: RawEvent[] = [];
  for (const ev of raw) {
    if (ev.recurrenceId) {
      const wc = parseWallClock(ev.recurrenceId, tz);
      if (!wc) continue;
      const key = toDateKey(wc.y, wc.m, wc.d);
      const perUid = overrides.get(ev.uid) ?? new Map<string, RawEvent>();
      perUid.set(key, ev);
      overrides.set(ev.uid, perUid);
    } else {
      masters.push(ev);
    }
  }

  const out: IcsEvent[] = [];
  const seen = new Set<string>();

  const emitEvent = (ev: RawEvent, occurrenceKey: string, shiftDays: number) => {
    const built = buildEvent(ev, occurrenceKey, shiftDays, tz);
    if (!built) return;
    if (built.endDate < from || built.startDate > to) return;
    const dedupe = `${built.uid}|${built.occurrence}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    out.push(built);
  };

  for (const ev of masters) {
    if (ev.status === 'CANCELLED') continue;
    const start = ev.dtstart ? parseWallClock(ev.dtstart, tz) : null;
    if (!start) continue;
    const startKey = toDateKey(start.y, start.m, start.d);
    const rule = ev.rrule ? parseRRule(ev.rrule) : null;

    const excluded = new Set<string>();
    for (const ex of ev.exdate) {
      for (const piece of ex.value.split(',')) {
        const wc = parseWallClock({ value: piece, params: ex.params }, tz);
        if (wc) excluded.add(toDateKey(wc.y, wc.m, wc.d));
      }
    }

    // A multi-day event that starts before the window can still reach into it.
    const spanDays = eventSpanDays(ev, start, tz);
    const searchFrom = addDaysToKey(from, -Math.min(spanDays, 60));
    const keys = expandRule(startKey, rule, searchFrom, to, maxEvents);
    const perUid = overrides.get(ev.uid);

    for (const key of keys) {
      if (excluded.has(key)) continue;
      const override = perUid?.get(key);
      if (override) {
        if (override.status !== 'CANCELLED') emitEvent(override, key, 0);
        continue;
      }
      const shiftDays = Math.round((dateKeyToMs(key) - dateKeyToMs(startKey)) / DAY_MS);
      emitEvent(ev, key, shiftDays);
    }
    if (out.length >= maxEvents) break;
  }

  // Overrides whose master never produced the occurrence (moved out of window
  // by the master's own rule) still belong on the plan.
  for (const [, perUid] of overrides) {
    for (const [, ev] of perUid) {
      if (ev.status === 'CANCELLED') continue;
      const wc = ev.dtstart ? parseWallClock(ev.dtstart, tz) : null;
      if (!wc) continue;
      emitEvent(ev, toDateKey(wc.y, wc.m, wc.d), 0);
    }
  }

  out.sort((a, b) => (a.startDate + (a.startsAt ?? '')).localeCompare(b.startDate + (b.startsAt ?? '')));
  return out.slice(0, maxEvents);
}

/** How many days the event covers, used to widen the recurrence search window. */
function eventSpanDays(ev: RawEvent, start: WallClock, tz: string): number {
  const startMs = wallClockToUtc(start, tz);
  let endMs = startMs;
  if (ev.dtend) {
    const end = parseWallClock(ev.dtend, tz);
    if (end) endMs = wallClockToUtc(end, tz);
  } else if (ev.duration) {
    endMs = startMs + parseDuration(ev.duration);
  }
  return Math.max(0, Math.ceil((endMs - startMs) / DAY_MS));
}

/** One concrete occurrence → the row shape the planner stores and renders. */
function buildEvent(ev: RawEvent, occurrenceKey: string, shiftDays: number, tz: string): IcsEvent | null {
  const start = ev.dtstart ? parseWallClock(ev.dtstart, tz) : null;
  if (!start) return null;

  const shift = (w: WallClock): WallClock => {
    if (shiftDays === 0) return w;
    const shifted = addDaysToKey(toDateKey(w.y, w.m, w.d), shiftDays).split('-').map(Number);
    return { ...w, y: shifted[0], m: shifted[1], d: shifted[2] };
  };

  const startShifted = shift(start);
  let end: WallClock | null = null;
  if (ev.dtend) {
    const parsed = parseWallClock(ev.dtend, tz);
    if (parsed) end = shift(parsed);
  }

  if (start.allDay) {
    const startDate = toDateKey(startShifted.y, startShifted.m, startShifted.d);
    // DTEND of an all-day event is exclusive; a planner row is inclusive.
    let endDate = startDate;
    if (end) {
      endDate = addDaysToKey(toDateKey(end.y, end.m, end.d), -1);
    } else if (ev.duration) {
      const days = Math.max(1, Math.round(parseDuration(ev.duration) / DAY_MS));
      endDate = addDaysToKey(startDate, days - 1);
    }
    if (endDate < startDate) endDate = startDate;
    return {
      uid: ev.uid, occurrence: occurrenceKey, title: ev.summary,
      description: ev.description, location: ev.location,
      allDay: true, startDate, endDate, startsAt: null, endsAt: null
    };
  }

  const startMs = wallClockToUtc(startShifted, tz);
  let endMs: number;
  if (end) endMs = wallClockToUtc(end, tz);
  else if (ev.duration) endMs = startMs + parseDuration(ev.duration);
  else endMs = startMs;
  if (endMs < startMs) endMs = startMs;

  const startDate = dateKeyIn(startMs, tz);
  // An event ending exactly at midnight belongs to the day before.
  const endBoundary = endMs > startMs ? endMs - 1 : endMs;
  let endDate = dateKeyIn(endBoundary, tz);
  if (endDate < startDate) endDate = startDate;

  return {
    uid: ev.uid, occurrence: occurrenceKey, title: ev.summary,
    description: ev.description, location: ev.location,
    allDay: false, startDate, endDate,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString()
  };
}
