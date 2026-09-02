import { describe, expect, it } from 'vitest';
import {
  addDaysToKey, expandIcs, expandRule, parseDuration, parseRRule, resolveZone, unfold, zonedToUtc,
} from '../supabase/functions/family-calendar-sync/ics.ts';

const TZ = 'Europe/Zurich';

function calendar(...events: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');
}

function vevent(lines: string[]): string {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
}

describe('unfold', () => {
  it('joins continuation lines and drops empty ones', () => {
    const lines = unfold('SUMMARY:Wald\r\n spielgruppe\r\n\r\nLOCATION:Wald');
    expect(lines).toEqual(['SUMMARY:Waldspielgruppe', 'LOCATION:Wald']);
  });
});

describe('zonedToUtc', () => {
  it('resolves winter time (CET, UTC+1)', () => {
    expect(new Date(zonedToUtc(2026, 1, 15, 14, 0, 0, TZ)).toISOString()).toBe('2026-01-15T13:00:00.000Z');
  });

  it('resolves summer time (CEST, UTC+2)', () => {
    expect(new Date(zonedToUtc(2026, 7, 15, 14, 0, 0, TZ)).toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });
});

describe('parseDuration', () => {
  it('reads days, hours and minutes', () => {
    expect(parseDuration('PT1H30M')).toBe(90 * 60_000);
    expect(parseDuration('P2D')).toBe(2 * 86_400_000);
    expect(parseDuration('P1W')).toBe(7 * 86_400_000);
  });
});

describe('expandIcs — single events', () => {
  it('reads an all-day event with an exclusive DTEND as an inclusive range', () => {
    const ics = calendar(vevent([
      'UID:ferien@example.com',
      'SUMMARY:Herbstferien',
      'DTSTART;VALUE=DATE:20261005',
      'DTEND;VALUE=DATE:20261010',
    ]));
    const [event] = expandIcs(ics, { from: '2026-09-01', to: '2026-12-31', tz: TZ });
    expect(event).toMatchObject({
      title: 'Herbstferien', allDay: true,
      startDate: '2026-10-05', endDate: '2026-10-09',
      startsAt: null, endsAt: null,
    });
  });

  it('treats a single all-day event without DTEND as one day', () => {
    const ics = calendar(vevent([
      'UID:tag@example.com', 'SUMMARY:Schulfrei', 'DTSTART;VALUE=DATE:20260908',
    ]));
    const [event] = expandIcs(ics, { from: '2026-09-01', to: '2026-09-30', tz: TZ });
    expect(event.startDate).toBe('2026-09-08');
    expect(event.endDate).toBe('2026-09-08');
  });

  it('converts a TZID wall clock to the right instant and day', () => {
    const ics = calendar(vevent([
      'UID:wald@example.com',
      'SUMMARY:Waldspielgruppe Miri',
      'DTSTART;TZID=Europe/Zurich:20260908T140000',
      'DTEND;TZID=Europe/Zurich:20260908T151500',
    ]));
    const [event] = expandIcs(ics, { from: '2026-09-01', to: '2026-09-30', tz: TZ });
    expect(event.allDay).toBe(false);
    expect(event.startsAt).toBe('2026-09-08T12:00:00.000Z');
    expect(event.endsAt).toBe('2026-09-08T13:15:00.000Z');
    expect(event.startDate).toBe('2026-09-08');
  });

  it('keeps a UTC event on its local day', () => {
    // 22:30 UTC is 00:30 the next day in Zurich.
    const ics = calendar(vevent([
      'UID:spaet@example.com', 'SUMMARY:Nachtzug',
      'DTSTART:20260908T223000Z', 'DTEND:20260908T233000Z',
    ]));
    const [event] = expandIcs(ics, { from: '2026-09-01', to: '2026-09-30', tz: TZ });
    expect(event.startDate).toBe('2026-09-09');
  });

  it('honours DURATION when DTEND is missing', () => {
    const ics = calendar(vevent([
      'UID:sport@example.com', 'SUMMARY:Sport',
      'DTSTART;TZID=Europe/Zurich:20260908T161000', 'DURATION:PT45M',
    ]));
    const [event] = expandIcs(ics, { from: '2026-09-01', to: '2026-09-30', tz: TZ });
    expect(event.endsAt).toBe('2026-09-08T14:55:00.000Z');
  });

  it('ends an event that stops exactly at midnight on the previous day', () => {
    const ics = calendar(vevent([
      'UID:abend@example.com', 'SUMMARY:Abends weg',
      'DTSTART;TZID=Europe/Zurich:20260910T190000',
      'DTEND;TZID=Europe/Zurich:20260911T000000',
    ]));
    const [event] = expandIcs(ics, { from: '2026-09-01', to: '2026-09-30', tz: TZ });
    expect(event.startDate).toBe('2026-09-10');
    expect(event.endDate).toBe('2026-09-10');
  });

  it('skips cancelled events', () => {
    const ics = calendar(vevent([
      'UID:weg@example.com', 'SUMMARY:Abgesagt', 'STATUS:CANCELLED',
      'DTSTART;VALUE=DATE:20260908',
    ]));
    expect(expandIcs(ics, { from: '2026-09-01', to: '2026-09-30', tz: TZ })).toHaveLength(0);
  });

  it('ignores VALARM sub-components', () => {
    const ics = calendar([
      'BEGIN:VEVENT',
      'UID:alarm@example.com', 'SUMMARY:Zahnarzt',
      'DTSTART;TZID=Europe/Zurich:20260908T100000',
      'DTEND;TZID=Europe/Zurich:20260908T103000',
      'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Erinnerung', 'END:VALARM',
      'END:VEVENT',
    ].join('\r\n'));
    const events = expandIcs(ics, { from: '2026-09-01', to: '2026-09-30', tz: TZ });
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Zahnarzt');
  });
});

describe('expandIcs — recurrence', () => {
  it('expands a weekly series onto the right weekdays', () => {
    const ics = calendar(vevent([
      'UID:kita@example.com', 'SUMMARY:Kita Miri',
      'DTSTART;TZID=Europe/Zurich:20260907T080000',
      'DTEND;TZID=Europe/Zurich:20260907T160000',
      'RRULE:FREQ=WEEKLY;BYDAY=MO,TH',
    ]));
    const events = expandIcs(ics, { from: '2026-09-07', to: '2026-09-20', tz: TZ });
    expect(events.map(e => e.startDate)).toEqual([
      '2026-09-07', '2026-09-10', '2026-09-14', '2026-09-17',
    ]);
  });

  it('keeps the wall-clock time across a DST switch', () => {
    const ics = calendar(vevent([
      'UID:dst@example.com', 'SUMMARY:Turnen',
      'DTSTART;TZID=Europe/Zurich:20261022T140000',
      'DTEND;TZID=Europe/Zurich:20261022T150000',
      'RRULE:FREQ=WEEKLY;BYDAY=TH;COUNT=3',
    ]));
    const events = expandIcs(ics, { from: '2026-10-01', to: '2026-11-30', tz: TZ });
    // 25.10.2026 is the CEST → CET switch; 14:00 local stays 14:00 local.
    expect(events.map(e => e.startsAt)).toEqual([
      '2026-10-22T12:00:00.000Z',
      '2026-10-29T13:00:00.000Z',
      '2026-11-05T13:00:00.000Z',
    ]);
  });

  it('respects COUNT even when the window starts later', () => {
    const ics = calendar(vevent([
      'UID:count@example.com', 'SUMMARY:Kurs',
      'DTSTART;VALUE=DATE:20260901', 'RRULE:FREQ=DAILY;COUNT=5',
    ]));
    const events = expandIcs(ics, { from: '2026-09-03', to: '2026-09-30', tz: TZ });
    expect(events.map(e => e.startDate)).toEqual(['2026-09-03', '2026-09-04', '2026-09-05']);
  });

  it('respects UNTIL', () => {
    const ics = calendar(vevent([
      'UID:until@example.com', 'SUMMARY:Kurs',
      'DTSTART;VALUE=DATE:20260907', 'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260921T000000Z',
    ]));
    const events = expandIcs(ics, { from: '2026-09-01', to: '2026-10-31', tz: TZ });
    expect(events.map(e => e.startDate)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
  });

  it('drops EXDATE occurrences', () => {
    const ics = calendar(vevent([
      'UID:ex@example.com', 'SUMMARY:Hort Lilly',
      'DTSTART;TZID=Europe/Zurich:20260907T120000',
      'DTEND;TZID=Europe/Zurich:20260907T160000',
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
      'EXDATE;TZID=Europe/Zurich:20260914T120000',
    ]));
    const events = expandIcs(ics, { from: '2026-09-01', to: '2026-09-30', tz: TZ });
    expect(events.map(e => e.startDate)).toEqual(['2026-09-07', '2026-09-21', '2026-09-28']);
  });

  it('lets RECURRENCE-ID replace a single occurrence', () => {
    const ics = calendar(
      vevent([
        'UID:series@example.com', 'SUMMARY:Schwimmen',
        'DTSTART;TZID=Europe/Zurich:20260911T160000',
        'DTEND;TZID=Europe/Zurich:20260911T170000',
        'RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=3',
      ]),
      vevent([
        'UID:series@example.com', 'SUMMARY:Schwimmen (später)',
        'RECURRENCE-ID;TZID=Europe/Zurich:20260918T160000',
        'DTSTART;TZID=Europe/Zurich:20260918T180000',
        'DTEND;TZID=Europe/Zurich:20260918T190000',
      ]),
    );
    const events = expandIcs(ics, { from: '2026-09-01', to: '2026-09-30', tz: TZ });
    expect(events.map(e => `${e.startDate} ${e.title}`)).toEqual([
      '2026-09-11 Schwimmen',
      '2026-09-18 Schwimmen (später)',
      '2026-09-25 Schwimmen',
    ]);
  });

  it('expands a monthly series by ordinal weekday', () => {
    const ics = calendar(vevent([
      'UID:elternabend@example.com', 'SUMMARY:Elternabend',
      'DTSTART;VALUE=DATE:20260908', 'RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3',
    ]));
    const events = expandIcs(ics, { from: '2026-09-01', to: '2026-12-31', tz: TZ });
    expect(events.map(e => e.startDate)).toEqual(['2026-09-08', '2026-10-13', '2026-11-10']);
  });

  it('expands a yearly series', () => {
    const ics = calendar(vevent([
      'UID:geburtstag@example.com', 'SUMMARY:Geburtstag Lilly',
      'DTSTART;VALUE=DATE:20200412', 'RRULE:FREQ=YEARLY',
    ]));
    const events = expandIcs(ics, { from: '2026-01-01', to: '2027-12-31', tz: TZ });
    expect(events.map(e => e.startDate)).toEqual(['2026-04-12', '2027-04-12']);
  });

  it('keeps a multi-day event that started before the window', () => {
    const ics = calendar(vevent([
      'UID:ferien2@example.com', 'SUMMARY:Sommerferien',
      'DTSTART;VALUE=DATE:20260713', 'DTEND;VALUE=DATE:20260817',
    ]));
    const events = expandIcs(ics, { from: '2026-08-01', to: '2026-08-31', tz: TZ });
    expect(events).toHaveLength(1);
    expect(events[0].startDate).toBe('2026-07-13');
    expect(events[0].endDate).toBe('2026-08-16');
  });
});

describe('expandRule', () => {
  it('returns the single date for a non-recurring event inside the window', () => {
    expect(expandRule('2026-09-08', null, '2026-09-01', '2026-09-30', 100)).toEqual(['2026-09-08']);
    expect(expandRule('2026-10-08', null, '2026-09-01', '2026-09-30', 100)).toEqual([]);
  });

  it('honours INTERVAL on a daily rule', () => {
    const rule = parseRRule('FREQ=DAILY;INTERVAL=3;COUNT=3');
    expect(expandRule('2026-09-01', rule, '2026-09-01', '2026-09-30', 100))
      .toEqual(['2026-09-01', '2026-09-04', '2026-09-07']);
  });

  it('caps runaway rules at maxEvents', () => {
    const rule = parseRRule('FREQ=DAILY');
    const keys = expandRule('2026-01-01', rule, '2026-01-01', '2026-12-31', 10);
    expect(keys).toHaveLength(10);
    expect(keys[9]).toBe(addDaysToKey('2026-01-01', 9));
  });
});

describe('time zone identifiers in the wild', () => {
  it('accepts IANA names', () => {
    expect(resolveZone('Europe/Zurich')).toEqual({ kind: 'iana', id: 'Europe/Zurich' });
    expect(resolveZone('UTC')).toEqual({ kind: 'iana', id: 'UTC' });
  });

  it('reads fixed offsets, however the feed spells them', () => {
    expect(resolveZone('GMT+0200')).toEqual({ kind: 'offset', minutes: 120 });
    expect(resolveZone('UTC+02:00')).toEqual({ kind: 'offset', minutes: 120 });
    expect(resolveZone('GMT-0530')).toEqual({ kind: 'offset', minutes: -330 });
    expect(resolveZone('(UTC+01:00) Amsterdam, Berlin, Bern')).toEqual({ kind: 'offset', minutes: 60 });
  });

  it('maps the Windows zone names Outlook exports', () => {
    expect(resolveZone('W. Europe Standard Time')).toEqual({ kind: 'iana', id: 'Europe/Berlin' });
    expect(resolveZone('Pacific Standard Time')).toEqual({ kind: 'iana', id: 'America/Los_Angeles' });
  });

  it('reports an unusable identifier instead of throwing', () => {
    expect(resolveZone('Customized Time Zone')).toBeNull();
    expect(resolveZone('')).toBeNull();
    expect(resolveZone(null)).toBeNull();
  });

  it('expands an event whose TZID is a bare offset (the iCloud/Outlook case)', () => {
    // Before this was handled, "Invalid time zone specified: GMT+0200" from
    // Intl aborted the entire sync.
    const ics = calendar(vevent([
      'UID:offset@example.com', 'SUMMARY:Elternabend',
      'DTSTART;TZID=GMT+0200:20260908T190000',
      'DTEND;TZID=GMT+0200:20260908T203000',
    ]));
    const [event] = expandIcs(ics, { from: '2026-09-01', to: '2026-09-30', tz: TZ });
    expect(event.startsAt).toBe('2026-09-08T17:00:00.000Z');
    expect(event.endsAt).toBe('2026-09-08T18:30:00.000Z');
    expect(event.startDate).toBe('2026-09-08');
  });

  it('falls back to the calendar zone for a TZID it cannot make sense of', () => {
    const ics = calendar(vevent([
      'UID:junk@example.com', 'SUMMARY:Turnen',
      'DTSTART;TZID=Customized Time Zone:20260908T140000',
      'DTEND;TZID=Customized Time Zone:20260908T150000',
    ]));
    const [event] = expandIcs(ics, { from: '2026-09-01', to: '2026-09-30', tz: TZ });
    // Read as 14:00 Zurich (CEST), not thrown away and not read as UTC.
    expect(event.startsAt).toBe('2026-09-08T12:00:00.000Z');
  });

  it('keeps the rest of the calendar when one event is unreadable', () => {
    const ics = calendar(
      vevent([
        'UID:broken@example.com', 'SUMMARY:Kaputt',
        'DTSTART;TZID=Europe/Zurich:not-a-timestamp',
      ]),
      vevent([
        'UID:fine@example.com', 'SUMMARY:Kita Miri',
        'DTSTART;TZID=Europe/Zurich:20260908T080000',
        'DTEND;TZID=Europe/Zurich:20260908T160000',
      ]),
    );
    const events = expandIcs(ics, { from: '2026-09-01', to: '2026-09-30', tz: TZ });
    expect(events.map(e => e.title)).toEqual(['Kita Miri']);
  });
});
