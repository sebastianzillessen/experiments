import { describe, expect, it } from 'vitest';
import { parseTitleTime, stripRedundantTime } from '../src/lib/parseTitleTime.ts';

/** Compact assertion: "Zahnarzt 14-15" → "Zahnarzt 14:00–15:00". */
function read(input: string): string | null {
  const parsed = parseTitleTime(input);
  if (!parsed) return null;
  return `${parsed.title} ${parsed.startTime}–${parsed.endTime}`;
}

describe('parseTitleTime — ranges', () => {
  it('reads the plain form from the paper sheet', () => {
    expect(read('Zahnarzt 14-15')).toBe('Zahnarzt 14:00–15:00');
  });

  it('accepts en dash, em dash and spaces around the dash', () => {
    expect(read('Zahnarzt 14–15')).toBe('Zahnarzt 14:00–15:00');
    expect(read('Zahnarzt 14 — 15')).toBe('Zahnarzt 14:00–15:00');
    expect(read('Zahnarzt 14 - 15')).toBe('Zahnarzt 14:00–15:00');
  });

  it('reads minutes with a colon or a dot', () => {
    expect(read('Sport 16:10-16:55')).toBe('Sport 16:00–16:55'.replace('16:00', '16:10'));
    expect(read('Sport 16.10-16.55')).toBe('Sport 16:10–16:55');
  });

  it('reads "bis" and "to" as the separator', () => {
    expect(read('Waldspielgruppe 14 bis 15:15')).toBe('Waldspielgruppe 14:00–15:15');
    expect(read('Call 9 to 10')).toBe('Call 09:00–10:00');
  });

  it('reads a "von … bis …" range', () => {
    expect(read('von 14:00 bis 15:30 Kita')).toBe('Kita 14:00–15:30');
  });

  it('reads "Uhr" on either end', () => {
    expect(read('GM 14 Uhr - 19 Uhr')).toBe('GM 14:00–19:00');
    expect(read('GM 9-10 Uhr')).toBe('GM 09:00–10:00');
  });

  it('reads am/pm, applying a single suffix to both ends', () => {
    expect(read('Zahnarzt 2-3pm')).toBe('Zahnarzt 14:00–15:00');
    expect(read('Zahnarzt 2pm-3pm')).toBe('Zahnarzt 14:00–15:00');
    expect(read('Brunch 11am-1pm')).toBe('Brunch 11:00–13:00');
  });

  it('does not read a range backwards when only the end says pm', () => {
    // "11-1pm" is 11:00–13:00, never 23:00–13:00.
    expect(read('Brunch 11-1pm')).toBe('Brunch 11:00–13:00');
  });

  it('leaves a bare range that runs over midnight alone', () => {
    // Nothing marks "22-2" as a time, and one end is not a plausible daytime
    // hour — so it stays part of the title rather than becoming a guess.
    expect(read('Party 22-2')).toBeNull();
  });

  it('keeps only the start when a marked range runs over midnight', () => {
    // A day-shaped entry cannot span midnight, so the end is dropped rather
    // than silently clamped when the entry is saved.
    expect(read('Party 22-2 Uhr')).toBe('Party 22:00–22:00');
  });

  it('finds the time wherever it sits in the line', () => {
    expect(read('14-15 Zahnarzt')).toBe('Zahnarzt 14:00–15:00');
    expect(read('Zahnarzt 14-15 mit Lilly')).toBe('Zahnarzt mit Lilly 14:00–15:00');
  });

  it('cleans up brackets and separators the time leaves behind', () => {
    expect(read('Zahnarzt (14-15)')).toBe('Zahnarzt 14:00–15:00');
    expect(read('Zahnarzt, 14-15')).toBe('Zahnarzt 14:00–15:00');
  });
});

describe('parseTitleTime — single times', () => {
  it('reads a marked single time and leaves the end equal to it', () => {
    expect(read('Waldspielgruppe 14 Uhr')).toBe('Waldspielgruppe 14:00–14:00');
    expect(read('Abholen 16:30')).toBe('Abholen 16:30–16:30');
    expect(read('Termin 9h')).toBe('Termin 09:00–09:00');
  });

  it('reads minutes written after "Uhr"', () => {
    expect(read('Kita 14 Uhr 30')).toBe('Kita 14:30–14:30');
  });

  it('reads a leading "ab" or "um" as the marker', () => {
    expect(read('ab 15 daheim')).toBe('daheim 15:00–15:00');
    expect(read('Reha um 18')).toBe('Reha 18:00–18:00');
  });

  it('reads pm on a single time', () => {
    expect(read('Schwimmen 4pm')).toBe('Schwimmen 16:00–16:00');
    expect(read('Frühstück 8 am')).toBe('Frühstück 08:00–08:00');
  });
});

describe('parseTitleTime — what it refuses to read', () => {
  it('leaves a bare number alone', () => {
    expect(read('Zimmer 12')).toBeNull();
    expect(read('KW 37')).toBeNull();
    expect(read('3 Kinder')).toBeNull();
    expect(read('Lars 1J daheim')).toBeNull();
  });

  it('leaves an implausible bare range alone', () => {
    // A room or a shoe size, not a time of day.
    expect(read('Zimmer 3-5')).toBeNull();
    expect(read('Gruppe 1-2')).toBeNull();
  });

  it('still reads an early range when something marks it as a time', () => {
    expect(read('Schicht 3-5 Uhr')).toBe('Schicht 03:00–05:00');
    expect(read('Flug 4:30-5:15')).toBe('Flug 04:30–05:15');
  });

  it('leaves "bis <time>" alone — an open start is not an entry we can store', () => {
    expect(read('Lilly bis 16:00 Hort')).toBeNull();
    expect(read('Hort bis 16')).toBeNull();
    expect(read('Basti bis 22 weg')).toBeNull();
  });

  it('refuses impossible clock values', () => {
    expect(read('Zimmer 25:00')).toBeNull();
    expect(read('Code 12:75')).toBeNull();
  });

  it('does not read a date as a time', () => {
    expect(read('Geburtstag 3.9.')).toBeNull();
    expect(read('Ferien 1.10.')).toBeNull();
    expect(read('Ferien 1.10.2026')).toBeNull();
  });

  it('still reads dotted times that are not dates', () => {
    expect(read('Sport 16.10-16.55')).toBe('Sport 16:10–16:55');
    expect(read('Abholen 16.30 Uhr')).toBe('Abholen 16:30–16:30');
  });

  it('returns nothing when the title would be left empty', () => {
    expect(read('14-15')).toBeNull();
    expect(read('16:30')).toBeNull();
  });

  it('returns nothing for an empty field', () => {
    expect(read('')).toBeNull();
    expect(read('   ')).toBeNull();
  });
});

describe('parseTitleTime — what it reports', () => {
  it('hands back the text it interpreted', () => {
    expect(parseTitleTime('Zahnarzt 14-15')?.source).toBe('14-15');
    expect(parseTitleTime('ab 15 daheim')?.source).toBe('ab 15');
  });
});

describe('stripRedundantTime', () => {
  it('drops a time the chip already shows', () => {
    // The worst chip on the wall iPad: six lines in one cell.
    expect(stripRedundantTime('GM schaut auf Lars 8:00-13:00', '08:00', '13:00'))
      .toBe('GM schaut auf Lars');
  });

  it('drops a title that only names the start', () => {
    expect(stripRedundantTime('ab 15 daheim', '15:00', '18:00')).toBe('daheim');
  });

  it('keeps a time that is not the entry\'s own', () => {
    // "Abgabe bis 16:00" on a 9-17 entry is information, not repetition.
    expect(stripRedundantTime('Abgabe bis 16:00', '09:00', '17:00'))
      .toBe('Abgabe bis 16:00');
    expect(stripRedundantTime('Termin 8:00-12:00', '08:00', '13:00'))
      .toBe('Termin 8:00-12:00');
  });

  it('leaves a title with no time alone', () => {
    expect(stripRedundantTime('Kinderarzt', '15:15', '17:00')).toBe('Kinderarzt');
    expect(stripRedundantTime('Zimmer 12', '15:15', '17:00')).toBe('Zimmer 12');
  });

  it('never strips a title down to nothing', () => {
    expect(stripRedundantTime('8:00-13:00', '08:00', '13:00')).toBe('8:00-13:00');
  });

  it('does nothing for an all-day entry', () => {
    expect(stripRedundantTime('Ferien 1.10.', null, null)).toBe('Ferien 1.10.');
  });
});
