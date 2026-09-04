import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_WEEK, EXAMPLE_YEAR, expandPattern, isSafeMenuBase, PLACEHOLDERS, resolveMenuUrl,
  unknownPlaceholders,
} from '../supabase/functions/family-menu-import/patterns.ts';

const HUTTEN = 'https://www.stadt-zuerich.ch/content/dam/stzh/schulen/hutten/downloads/';

describe('expandPattern', () => {
  it('builds the name the school actually uses', () => {
    expect(expandPattern('{KW}.{JJ}.pdf', 2026, 37)).toBe('37.26.pdf');
  });

  it('pads where asked and not where not', () => {
    expect(expandPattern('{KW}.{JJ}.pdf', 2026, 7)).toBe('7.26.pdf');
    expect(expandPattern('{KW2}.{JJ}.pdf', 2026, 7)).toBe('07.26.pdf');
  });

  it('fills the Monday of the week for a date-named file', () => {
    // Week 37 of 2026 starts on Monday 7 September.
    expect(expandPattern('menuplan-{JJJJ}-{MM}-{TT}.pdf', 2026, 37))
      .toBe('menuplan-2026-09-07.pdf');
    expect(expandPattern('{JJJJ}/{M}/plan-{T}.pdf', 2026, 37)).toBe('2026/9/plan-7.pdf');
  });

  it('leaves a placeholder it does not know alone', () => {
    expect(expandPattern('{KW}-{QUARTAL}.pdf', 2026, 37)).toBe('37-{QUARTAL}.pdf');
  });

  it('has an example for every placeholder it offers', () => {
    // The settings screen prints these next to each token, so a stale example
    // is a wrong instruction rather than a cosmetic slip.
    for (const p of PLACEHOLDERS) {
      expect(expandPattern(p.token, EXAMPLE_YEAR, EXAMPLE_WEEK)).toBe(p.example);
    }
  });
});

describe('unknownPlaceholders', () => {
  it('names what will not be filled in', () => {
    expect(unknownPlaceholders('{KW}.{JJ}.pdf')).toEqual([]);
    expect(unknownPlaceholders('{KW}-{Woche}-{Woche}.pdf')).toEqual(['{Woche}']);
  });
});

describe('isSafeMenuBase', () => {
  it('takes a plain https address', () => {
    expect(isSafeMenuBase(HUTTEN)).toBe(true);
    expect(isSafeMenuBase('https://schule.example.org/menu/')).toBe(true);
  });

  it('refuses http and anything pointing inward', () => {
    expect(isSafeMenuBase('http://www.stadt-zuerich.ch/')).toBe(false);
    expect(isSafeMenuBase('https://localhost/')).toBe(false);
    expect(isSafeMenuBase('https://nas.local/')).toBe(false);
    expect(isSafeMenuBase('https://127.0.0.1/')).toBe(false);
    expect(isSafeMenuBase('https://10.0.0.5/')).toBe(false);
    expect(isSafeMenuBase('https://172.16.4.1/')).toBe(false);
    expect(isSafeMenuBase('https://192.168.1.1/')).toBe(false);
    expect(isSafeMenuBase('https://169.254.169.254/')).toBe(false);
    expect(isSafeMenuBase('file:///etc/passwd')).toBe(false);
    expect(isSafeMenuBase('not a url')).toBe(false);
  });

  it('lets a public address through even when it looks numeric', () => {
    expect(isSafeMenuBase('https://8.8.8.8/menu/')).toBe(true);
    expect(isSafeMenuBase('https://172.32.0.1/menu/')).toBe(true);
  });
});

describe('resolveMenuUrl', () => {
  it('joins base and pattern', () => {
    expect(resolveMenuUrl(HUTTEN, '{KW}.{JJ}.pdf', 2026, 37)).toBe(HUTTEN + '37.26.pdf');
  });

  it('adds the missing slash to a base', () => {
    expect(resolveMenuUrl('https://schule.example.org/menu', '{KW}.pdf', 2026, 37))
      .toBe('https://schule.example.org/menu/37.pdf');
  });

  it('allows a subfolder in the pattern', () => {
    expect(resolveMenuUrl(HUTTEN, '{JJJJ}/{KW}.pdf', 2026, 37)).toBe(HUTTEN + '2026/37.pdf');
  });

  it('refuses a pattern that climbs out of the base', () => {
    expect(resolveMenuUrl(HUTTEN, '../../secrets.pdf', 2026, 37)).toBeNull();
    expect(resolveMenuUrl(HUTTEN, '..%2f..%2fsecrets.pdf', 2026, 37)).toBeNull();
  });

  it('refuses a pattern that is an address of its own', () => {
    // A whole URL in the pattern would otherwise make this fetch anything.
    expect(resolveMenuUrl(HUTTEN, 'https://evil.example.com/x.pdf', 2026, 37)).toBeNull();
    expect(resolveMenuUrl(HUTTEN, '//evil.example.com/x.pdf', 2026, 37)).toBeNull();
    expect(resolveMenuUrl(HUTTEN, '/other/x.pdf', 2026, 37)).toBeNull();
  });

  it('refuses an unsafe base whatever the pattern says', () => {
    expect(resolveMenuUrl('http://www.stadt-zuerich.ch/', '{KW}.pdf', 2026, 37)).toBeNull();
    expect(resolveMenuUrl('https://192.168.0.1/', '{KW}.pdf', 2026, 37)).toBeNull();
  });

  it('refuses an empty pattern', () => {
    expect(resolveMenuUrl(HUTTEN, '', 2026, 37)).toBeNull();
    expect(resolveMenuUrl(HUTTEN, '   ', 2026, 37)).toBeNull();
  });
});
