import { describe, expect, it } from 'vitest';
import {
  addMonths, dayLabel, daysBetween, formatClock, isoWeekNumber, isWeekend, localToIso, monthDays,
  relativeStamp, startOfWeek, timeLabel, timeRangeLabel, timeValue, todayKey, weekDays, weekLabel,
} from '../src/lib/dates.ts';

const TZ = 'Europe/Zurich';

describe('week arithmetic', () => {
  it('starts the week on Monday', () => {
    expect(startOfWeek('2026-09-09')).toBe('2026-09-07'); // Wednesday → Monday
    expect(startOfWeek('2026-09-07')).toBe('2026-09-07'); // Monday stays
    expect(startOfWeek('2026-09-13')).toBe('2026-09-07'); // Sunday belongs to the week before
  });

  it('can start the week on Sunday when a family prefers it', () => {
    expect(startOfWeek('2026-09-09', 0)).toBe('2026-09-06');
  });

  it('lists seven days', () => {
    expect(weekDays('2026-09-07')).toEqual([
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
      '2026-09-11', '2026-09-12', '2026-09-13',
    ]);
  });

  it('marks Saturday and Sunday as weekend', () => {
    expect(isWeekend('2026-09-12')).toBe(true);
    expect(isWeekend('2026-09-13')).toBe(true);
    expect(isWeekend('2026-09-11')).toBe(false);
  });
});

describe('month arithmetic', () => {
  it('lists every day of the month', () => {
    const days = monthDays('2026-02-15');
    expect(days).toHaveLength(28);
    expect(days[0]).toBe('2026-02-01');
    expect(days[27]).toBe('2026-02-28');
  });

  it('clamps the day when a month is shorter', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });
});

describe('isoWeekNumber', () => {
  it('matches the KW on the paper sheet', () => {
    expect(isoWeekNumber('2026-09-07')).toBe(37);
    expect(isoWeekNumber('2026-09-14')).toBe(38);
  });

  it('handles the turn of the year', () => {
    expect(isoWeekNumber('2027-01-01')).toBe(53);
    expect(isoWeekNumber('2027-01-04')).toBe(1);
  });
});

describe('labels', () => {
  it('formats a day the way the planner row reads', () => {
    expect(dayLabel('2026-09-07')).toBe('Mo 7.9.');
  });

  it('formats the week range', () => {
    expect(weekLabel('2026-09-07')).toBe('KW 37 · 7.–13. Sep 2026');
  });

  it('formats a range crossing a month boundary', () => {
    expect(weekLabel('2026-09-28')).toBe('KW 40 · 28. Sep – 4. Okt 2026');
  });

  it('formats times in the family zone', () => {
    expect(timeRangeLabel('2026-09-08T12:00:00.000Z', '2026-09-08T13:15:00.000Z', TZ)).toBe('14:00–15:15');
    expect(timeRangeLabel('2026-01-15T13:00:00.000Z', null, TZ)).toBe('14:00');
  });

  it('formats sync stamps relative to today', () => {
    const now = Date.parse('2026-09-09T09:00:00Z');
    expect(relativeStamp('2026-09-09T05:42:00Z', TZ, now)).toBe('heute 07:42');
    expect(relativeStamp('2026-09-08T20:10:00Z', TZ, now)).toBe('gestern 22:10');
    expect(relativeStamp('2026-08-31T07:00:00Z', TZ, now)).toBe('31.8. 09:00');
    expect(relativeStamp(null, TZ, now)).toBe('noch nie');
  });
});

describe('todayKey', () => {
  it('uses the family zone, not UTC', () => {
    // 23:30 UTC is already the next day in Zurich.
    expect(todayKey(TZ, Date.parse('2026-09-08T23:30:00Z'))).toBe('2026-09-09');
  });
});

describe('localToIso', () => {
  it('reads a typed time as a wall clock in the family zone', () => {
    expect(localToIso('2026-09-08', '14:00', TZ)).toBe('2026-09-08T12:00:00.000Z');
    expect(localToIso('2026-01-15', '14:00', TZ)).toBe('2026-01-15T13:00:00.000Z');
  });
});

describe('daysBetween', () => {
  it('clips an event span to the visible window', () => {
    expect(daysBetween('2026-09-05', '2026-09-09', '2026-09-07', '2026-09-13'))
      .toEqual(['2026-09-07', '2026-09-08', '2026-09-09']);
  });

  it('returns nothing when the event is outside the window', () => {
    expect(daysBetween('2026-08-01', '2026-08-05', '2026-09-07', '2026-09-13')).toEqual([]);
  });
});

describe('clock format', () => {
  it('writes 24h times zero-padded', () => {
    expect(formatClock(9, 5, '24h')).toBe('09:05');
    expect(formatClock(14, 0, '24h')).toBe('14:00');
    expect(formatClock(0, 30, '24h')).toBe('00:30');
  });

  it('writes AM/PM times the way a clock is read aloud', () => {
    expect(formatClock(9, 5, '12h')).toBe('9:05 AM');
    expect(formatClock(14, 0, '12h')).toBe('2:00 PM');
    expect(formatClock(0, 30, '12h')).toBe('12:30 AM');   // midnight is 12, not 0
    expect(formatClock(12, 0, '12h')).toBe('12:00 PM');   // noon is PM
    expect(formatClock(23, 59, '12h')).toBe('11:59 PM');
  });

  it('labels an instant in the family zone and format', () => {
    expect(timeLabel('2026-09-08T12:00:00.000Z', TZ, '24h')).toBe('14:00');
    expect(timeLabel('2026-09-08T12:00:00.000Z', TZ, '12h')).toBe('2:00 PM');
  });

  it('writes a shared AM/PM suffix only once', () => {
    expect(timeRangeLabel('2026-09-08T12:00:00.000Z', '2026-09-08T13:15:00.000Z', TZ, '12h'))
      .toBe('2:00–3:15 PM');
  });

  it('keeps both suffixes when the range crosses noon', () => {
    expect(timeRangeLabel('2026-09-08T09:30:00.000Z', '2026-09-08T11:00:00.000Z', TZ, '12h'))
      .toBe('11:30 AM–1:00 PM');
  });

  it('follows the format for a single time too', () => {
    expect(timeRangeLabel('2026-09-08T12:00:00.000Z', null, TZ, '12h')).toBe('2:00 PM');
  });

  it('defaults to 24h when no format is given', () => {
    expect(timeRangeLabel('2026-09-08T12:00:00.000Z', null, TZ)).toBe('14:00');
  });

  it('formats sync stamps in the chosen format', () => {
    const now = Date.parse('2026-09-09T09:00:00Z');
    expect(relativeStamp('2026-09-09T05:42:00Z', TZ, now, '12h')).toBe('heute 7:42 AM');
  });

  it('keeps time input values at 24h whatever the family prefers', () => {
    // <input type="time"> only accepts "HH:MM"; seeding it with "2:00 PM"
    // would silently blank the field.
    expect(timeValue('2026-09-08T12:00:00.000Z', TZ)).toBe('14:00');
    expect(timeValue('2026-09-08T05:05:00.000Z', TZ)).toBe('07:05');
  });
});
