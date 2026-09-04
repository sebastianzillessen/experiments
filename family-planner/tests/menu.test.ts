import { describe, expect, it } from 'vitest';
import {
  isoWeek, mondayOfIsoWeek, schoolDays, todayInZone, validateMenuWeek,
} from '../supabase/functions/family-menu-import/menu.ts';

describe('ISO weeks', () => {
  it('matches the weeks the school itself printed', () => {
    // From the published PDFs: 35.26 says 24.–28.08.2026, 36.26 says
    // 31.08.–04.09.2026, 37.26 says 07.–11.09.2026.
    expect(schoolDays(2026, 35)).toEqual(
      ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28']);
    expect(mondayOfIsoWeek(2026, 36)).toBe('2026-08-31');
    expect(mondayOfIsoWeek(2026, 37)).toBe('2026-09-07');
  });

  it('reads the week back off any day of it', () => {
    expect(isoWeek('2026-09-07')).toEqual({ year: 2026, week: 37 });
    expect(isoWeek('2026-09-11')).toEqual({ year: 2026, week: 37 });
    expect(isoWeek('2026-09-13')).toEqual({ year: 2026, week: 37 });
  });

  it('puts the turn of the year in the right week', () => {
    // 1 January 2027 is a Friday, so it belongs to week 53 of 2026 — asking
    // for "week 1 of 2027" there would fetch the wrong file.
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 });
    expect(isoWeek('2026-01-01')).toEqual({ year: 2026, week: 1 });
    expect(isoWeek('2024-12-30')).toEqual({ year: 2025, week: 1 });
  });

  it('round-trips every week of a few years', () => {
    for (const year of [2024, 2025, 2026, 2027]) {
      for (let week = 1; week <= 52; week++) {
        expect(isoWeek(mondayOfIsoWeek(year, week))).toEqual({ year, week });
      }
    }
  });
});

describe('todayInZone', () => {
  it('reads the local day, not the server day', () => {
    // 22:30 UTC on 6 September is already the 7th in Zurich, which is the
    // Monday that starts week 37.
    const late = Date.parse('2026-09-06T22:30:00Z');
    expect(todayInZone('Europe/Zurich', late)).toBe('2026-09-07');
    expect(todayInZone('UTC', late)).toBe('2026-09-06');
    expect(isoWeek(todayInZone('Europe/Zurich', late))).toEqual({ year: 2026, week: 37 });
  });
});

describe('validateMenuWeek', () => {
  const good = {
    days: [
      { date: '2026-09-07', dishes: [
        { name: 'Lasagne (R)', tags: [] },
        { name: 'Erbsli und Rüebli', tags: ['lactose-free', 'gluten-free'] },
      ] },
      { date: '2026-09-11', dishes: [{ name: 'Bio-Reis', tags: [] }] },
    ],
  };

  it('keeps what belongs to the week and fills in the range', () => {
    const week = validateMenuWeek(good, 2026, 37);
    expect(week).toMatchObject({ year: 2026, week: 37, from: '2026-09-07', to: '2026-09-11' });
    expect(week.days).toHaveLength(2);
    expect(week.days[0].dishes[1].tags).toEqual(['gluten-free', 'lactose-free']);
  });

  it('drops a day from another week rather than showing it', () => {
    const week = validateMenuWeek(
      { days: [...good.days, { date: '2026-09-14', dishes: [{ name: 'Nächste Woche' }] }] },
      2026, 37);
    expect(week.days.map(d => d.date)).toEqual(['2026-09-07', '2026-09-11']);
  });

  it('drops a repeated day, an empty dish and an unknown tag', () => {
    const week = validateMenuWeek({
      days: [
        { date: '2026-09-07', dishes: [{ name: 'Lasagne', tags: ['gluten-free', 'halal'] }] },
        { date: '2026-09-07', dishes: [{ name: 'Doppelt' }] },
        { date: '2026-09-08', dishes: [{ name: '   ' }, { name: '' }] },
      ],
    }, 2026, 37);
    expect(week.days).toHaveLength(1);
    expect(week.days[0].dishes[0].tags).toEqual(['gluten-free']);
  });

  it('tidies the whitespace a scan leaves behind', () => {
    const week = validateMenuWeek(
      { days: [{ date: '2026-09-07', dishes: [{ name: '  Bio  Knospe-Rahmspinat \n' }] }] },
      2026, 37);
    expect(week.days[0].dishes[0].name).toBe('Bio Knospe-Rahmspinat');
  });

  it('sorts the days even when the model does not', () => {
    const week = validateMenuWeek({ days: [good.days[1], good.days[0]] }, 2026, 37);
    expect(week.days.map(d => d.date)).toEqual(['2026-09-07', '2026-09-11']);
  });

  it('refuses to report an empty week as a success', () => {
    expect(() => validateMenuWeek({ days: [] }, 2026, 37)).toThrow(/keine Gerichte/);
    expect(() => validateMenuWeek({}, 2026, 37)).toThrow(/keine Tage/);
    expect(() => validateMenuWeek(null, 2026, 37)).toThrow(/keine Tage/);
    // A whole week read as the wrong week is not a partial success.
    expect(() => validateMenuWeek(good, 2026, 38)).toThrow(/keine Gerichte/);
  });
});
