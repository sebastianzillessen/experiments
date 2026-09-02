import { describe, expect, it } from 'vitest';
import { normalizeCalendarUrl } from '../supabase/functions/family-calendar-sync/url.ts';

describe('normalizeCalendarUrl', () => {
  it('rewrites a webcal link to https — the form iCloud and Apple hand out', () => {
    expect(normalizeCalendarUrl('webcal://p103-caldav.icloud.com/published/2/AbC-xQ-dEf_8o'))
      .toBe('https://p103-caldav.icloud.com/published/2/AbC-xQ-dEf_8o');
  });

  it('rewrites webcals:// and is case-insensitive about the scheme', () => {
    expect(normalizeCalendarUrl('WEBCAL://example.com/cal.ics')).toBe('https://example.com/cal.ics');
    expect(normalizeCalendarUrl('webcals://example.com/cal.ics')).toBe('https://example.com/cal.ics');
  });

  it('keeps a plain https feed, query string included', () => {
    const url = 'https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/private-123/basic.ics?x=1';
    expect(normalizeCalendarUrl(url)).toBe(url);
  });

  it('trims surrounding whitespace from a pasted address', () => {
    expect(normalizeCalendarUrl('  https://example.com/cal.ics \n')).toBe('https://example.com/cal.ics');
  });

  it('rejects plain http — the feed URL is a secret', () => {
    expect(() => normalizeCalendarUrl('http://example.com/cal.ics')).toThrow(/https/);
  });

  it('rejects other schemes', () => {
    expect(() => normalizeCalendarUrl('file:///etc/passwd')).toThrow();
    expect(() => normalizeCalendarUrl('ftp://example.com/cal.ics')).toThrow();
  });

  it('rejects an empty or unparseable address', () => {
    expect(() => normalizeCalendarUrl('')).toThrow(/Keine Kalender-Adresse/);
    expect(() => normalizeCalendarUrl('not a url')).toThrow(/Ungültige/);
  });

  it('rejects hosts inside a private network (SSRF guard)', () => {
    for (const host of [
      'https://localhost/cal.ics',
      'https://nas.local/cal.ics',
      'https://intranet.internal/cal.ics',
      'https://127.0.0.1/cal.ics',
      'https://10.0.0.5/cal.ics',
      'https://192.168.1.10/cal.ics',
      'https://172.16.0.9/cal.ics',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/cal.ics',
      'https://[fd00::1]/cal.ics',
    ]) {
      expect(() => normalizeCalendarUrl(host), host).toThrow(/nicht erreichbar/);
    }
  });

  it('allows a public address that merely looks similar', () => {
    expect(normalizeCalendarUrl('https://172.32.0.1/cal.ics')).toBe('https://172.32.0.1/cal.ics');
    expect(normalizeCalendarUrl('https://mylocal.example.com/cal.ics')).toBe('https://mylocal.example.com/cal.ics');
  });
});
