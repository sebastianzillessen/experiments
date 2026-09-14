import { describe, expect, it } from 'vitest';
import { parseTaskDates, weekdayOfKey } from '../src/lib/parseTaskDates.ts';

// The message this parser exists for, pasted as it arrived.
const WHATSAPP = `Hey Alexandra,

Here the complete list for the upcoming months

- Mon, Sept 7
- ⁠Sat, Sept 12
- ⁠Thu, Sept 24
- _still my special request for Sun, Sept 27, maybe something changed 😉 but I know you already said you cannot do it_
- Sat, Oct 3
- ⁠Mon, Oct 5
- *⁠Thur, Oct 15*

Rest of October is still pretty empty.

All the best,
Sebastian`;

const NOW = new Date('2026-09-14T10:00:00Z');

describe('parseTaskDates', () => {
  const lines = parseTaskDates(WHATSAPP, NOW);

  it('finds every date in the list and nothing else', () => {
    expect(lines.map(l => l.date)).toEqual([
      '2026-09-07', '2026-09-12', '2026-09-24', '2026-09-27',
      '2026-10-03', '2026-10-05', '2026-10-15',
    ]);
  });

  it('reads greetings, notes and sign-offs as what they are', () => {
    const texts = lines.map(l => l.text).join(' ');
    expect(texts).not.toMatch(/Hey Alexandra/);
    expect(texts).not.toMatch(/Rest of October/);
    expect(texts).not.toMatch(/All the best/);
  });

  it('marks the new dates as new and the unsettled one as unsettled', () => {
    const byDate = new Map(lines.map(l => [l.date, l]));
    expect(byDate.get('2026-10-15')?.emphasis).toBe('bold');
    expect(byDate.get('2026-09-27')?.emphasis).toBe('italic');
    expect(byDate.get('2026-09-07')?.emphasis).toBeNull();
  });

  it('does not book what was only asked for', () => {
    const byDate = new Map(lines.map(l => [l.date, l]));
    // The italic line is the request the cleaner had already turned down.
    expect(byDate.get('2026-09-27')?.suggested).toBe(false);
    expect(byDate.get('2026-10-15')?.suggested).toBe(true);
    expect(lines.filter(l => l.suggested)).toHaveLength(6);
  });

  it('keeps the invisible characters a copied message carries out of the text', () => {
    expect(lines.some(l => /[⁠​­]/.test(l.text))).toBe(false);
    expect(lines.map(l => l.text)).toContain('Sat, Sept 12');
  });

  it('agrees with the weekdays the message names', () => {
    expect(lines.every(l => !l.weekdayMismatch)).toBe(true);
  });
});

describe('what the message got wrong', () => {
  it('flags a weekday that does not belong to its date', () => {
    // 3 October 2026 is a Saturday, not a Monday.
    const [line] = parseTaskDates('- Mon, Oct 3', NOW);
    expect(line.date).toBe('2026-10-03');
    expect(line.weekdayMismatch).toBe(true);
    expect(line.suggested).toBe(false);
  });

  it('drops a day that does not exist', () => {
    expect(parseTaskDates('- Sept 31', NOW)).toEqual([]);
  });

  it('lists a date once, however often it was written', () => {
    expect(parseTaskDates('- Sat, Oct 3\n- 3. Oktober\n- 03.10.2026', NOW)).toHaveLength(1);
  });
});

describe('the other ways people write a date', () => {
  const one = (text: string) => parseTaskDates(text, NOW)[0]?.date ?? null;

  it('reads German and English, long and short', () => {
    expect(one('- 15. Oktober')).toBe('2026-10-15');
    expect(one('- 15. Okt.')).toBe('2026-10-15');
    expect(one('- 15.10.')).toBe('2026-10-15');
    expect(one('- 15.10.2026')).toBe('2026-10-15');
    expect(one('- 15.10.26')).toBe('2026-10-15');
    expect(one('- October 15th')).toBe('2026-10-15');
    expect(one('- Oct 15, 2026')).toBe('2026-10-15');
    expect(one('- 2026-10-15')).toBe('2026-10-15');
    expect(one('• Donnerstag, 15. Oktober')).toBe('2026-10-15');
  });

  it('reads a list without a year as the months ahead', () => {
    // A few days back is still this year — lists usually start in the past.
    expect(one('- Sept 7')).toBe('2026-09-07');
    // Half a year back means next year: nobody sends a list for March gone.
    expect(one('- March 2')).toBe('2027-03-02');
  });

  it('ignores a number that is not a day', () => {
    expect(one('- Sat, Oct 3, ab 9 Uhr')).toBe('2026-10-03');
  });
});

describe('weekdayOfKey', () => {
  it('counts Monday as 1 and Sunday as 7', () => {
    expect(weekdayOfKey('2026-09-07')).toBe(1);
    expect(weekdayOfKey('2026-09-13')).toBe(7);
  });
});
