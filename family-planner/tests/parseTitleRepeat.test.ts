import { describe, expect, it } from 'vitest';
import { parseTitleRepeat } from '../src/lib/parseTitleRepeat.ts';
import { parseTitleTime } from '../src/lib/parseTitleTime.ts';

/** "Kita jeden Freitag" → "Kita | 1× [5]" */
function read(input: string): string | null {
  const parsed = parseTitleRepeat(input);
  if (!parsed) return null;
  return `${parsed.title} | ${parsed.repeat.interval}× [${parsed.repeat.weekdays.join(',')}]`;
}

describe('parseTitleRepeat — what it reads', () => {
  it('reads the everyday form', () => {
    expect(read('Kita jeden Freitag')).toBe('Kita | 1× [5]');
    expect(read('jeden Montag Turnen')).toBe('Turnen | 1× [1]');
  });

  it('reads abbreviated weekdays', () => {
    expect(read('Kita jeden Fr')).toBe('Kita | 1× [5]');
    expect(read('Hort jeden Di.')).toBe('Hort | 1× [2]');
  });

  it('reads several weekdays', () => {
    expect(read('Kita jeden Montag und Donnerstag')).toBe('Kita | 1× [1,4]');
    expect(read('Kita jeden Mo, Mi, Fr')).toBe('Kita | 1× [1,3,5]');
    expect(read('Sport jeden Di + Do')).toBe('Sport | 1× [2,4]');
  });

  it('reads the German plural as a pattern of its own', () => {
    expect(read('Hort freitags')).toBe('Hort | 1× [5]');
    expect(read('Turnen montags und donnerstags')).toBe('Turnen | 1× [1,4]');
  });

  it('reads an interval', () => {
    expect(read('Putzen jeden 2. Freitag')).toBe('Putzen | 2× [5]');
    expect(read('Musik alle 2 Wochen')).toBe('Musik | 2× []');
    expect(read('Team alle 3 Wochen')).toBe('Team | 3× []');
  });

  it('reads a weekday-less weekly pattern (the start date decides the day)', () => {
    expect(read('Musikschule jede Woche')).toBe('Musikschule | 1× []');
    expect(read('Yoga wöchentlich')).toBe('Yoga | 1× []');
  });

  it('reads English', () => {
    expect(read('Daycare every Friday')).toBe('Daycare | 1× [5]');
    expect(read('Standup every 2 weeks')).toBe('Standup | 2× []');
    expect(read('Cleaning weekly')).toBe('Cleaning | 1× []');
  });

  it('hands back the text it interpreted', () => {
    expect(parseTitleRepeat('Kita jeden Freitag')?.source).toBe('jeden Freitag');
  });
});

describe('parseTitleRepeat — what it refuses', () => {
  it('leaves a weekday inside a word alone', () => {
    expect(read('Montagsmarkt besuchen')).toBeNull();
    expect(read('Freitagsverkauf')).toBeNull();
  });

  it('leaves a single named day alone — that is a date, not a series', () => {
    expect(read('Freitag Zahnarzt')).toBeNull();
    expect(read('Am Montag Elternabend')).toBeNull();
  });

  it('leaves an ordinary title alone', () => {
    expect(read('Zahnarzt 14-15')).toBeNull();
    expect(read('Brunch bei Oma')).toBeNull();
    expect(read('')).toBeNull();
  });

  it('returns nothing when the title would be left empty', () => {
    expect(read('jeden Freitag')).toBeNull();
    expect(read('wöchentlich')).toBeNull();
  });

  it('clamps a nonsensical interval', () => {
    expect(read('Termin alle 99 Wochen')).toBe('Termin | 1× []');
  });
});

describe('together with the time parser', () => {
  it('reads pattern and time from one line', () => {
    // The repeat parser runs first; the time parser sees what is left.
    const repeat = parseTitleRepeat('Kita jeden Freitag 8-16')!;
    expect(repeat.title).toBe('Kita 8-16');
    expect(repeat.repeat.weekdays).toEqual([5]);

    const time = parseTitleTime(repeat.title)!;
    expect(time.title).toBe('Kita');
    expect(time.startTime).toBe('08:00');
    expect(time.endTime).toBe('16:00');
  });

  it('does not mistake the interval for a time', () => {
    const repeat = parseTitleRepeat('Putzen jeden 2. Freitag')!;
    expect(repeat.title).toBe('Putzen');
    expect(parseTitleTime(repeat.title)).toBeNull();
  });
});
