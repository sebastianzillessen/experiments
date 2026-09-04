// Where a school keeps its weekly menu.
//
// One school names its files by calendar week (`37.26.pdf`), another by the
// Monday's date (`menuplan-2026-09-07.pdf`), a third puts the month in a
// folder. Rather than teach the app each of them, the family enters a base
// address and one or more patterns, and the placeholders below are filled in
// per week.
//
// Several patterns are allowed because a single school is often inconsistent
// itself: weeks below ten may or may not be padded, and trying `7.26.pdf` then
// `07.26.pdf` is cheaper than finding out which by hand every January.

import { mondayOfIsoWeek } from './menu.ts';

export type Placeholder = {
  token: string;
  /** Shown in the settings so nobody has to guess. German: it is UI text. */
  label: string;
  example: string;
};

/** The week every example below describes: week 7 of 2026, Monday 9 February. */
export const EXAMPLE_YEAR = 2026;
export const EXAMPLE_WEEK = 7;

/**
 * Every placeholder, in the order the settings screen lists them. The examples
 * all come from one week on purpose, and from a week where both halves are
 * single-digit, so the padded and unpadded forms differ visibly.
 */
export const PLACEHOLDERS: Placeholder[] = [
  { token: '{KW}', label: 'Kalenderwoche', example: '7' },
  { token: '{KW2}', label: 'Kalenderwoche, zweistellig', example: '07' },
  { token: '{JJ}', label: 'Jahr, zweistellig', example: '26' },
  { token: '{JJJJ}', label: 'Jahr, vierstellig', example: '2026' },
  { token: '{M}', label: 'Monat des Montags', example: '2' },
  { token: '{MM}', label: 'Monat des Montags, zweistellig', example: '02' },
  { token: '{T}', label: 'Tag des Montags', example: '9' },
  { token: '{TT}', label: 'Tag des Montags, zweistellig', example: '09' },
];

function values(year: number, week: number): Record<string, string> {
  const [y, m, d] = mondayOfIsoWeek(year, week).split('-');
  return {
    '{KW}': String(week),
    '{KW2}': String(week).padStart(2, '0'),
    '{JJ}': y.slice(2),
    '{JJJJ}': y,
    '{M}': String(Number(m)),
    '{MM}': m,
    '{T}': String(Number(d)),
    '{TT}': d,
  };
}

/** Placeholders that are not one of ours, so the settings can say so. */
export function unknownPlaceholders(pattern: string): string[] {
  const known = new Set(PLACEHOLDERS.map(p => p.token));
  const found = pattern.match(/\{[^{}]*\}/g) ?? [];
  return [...new Set(found.filter(token => !known.has(token)))];
}

/** Fill in a pattern for one week. Unknown placeholders are left standing. */
export function expandPattern(pattern: string, year: number, week: number): string {
  const table = values(year, week);
  return pattern.replace(/\{[^{}]*\}/g, token => table[token] ?? token);
}

/**
 * A base address the function may be pointed at.
 *
 * Owners configure this, and the function holds a service-role key, so the
 * usual suspects are out: only https, and nothing that resolves inside the
 * network the function runs in.
 */
export function isSafeMenuBase(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;

  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (host === '[::1]' || host === '::1') return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
  }
  return true;
}

/**
 * Base plus filled-in pattern, as one address.
 *
 * The result must still sit under the base. A pattern is family-entered text,
 * and `../../` or a bare `https://elsewhere/` in it would otherwise turn this
 * into a fetcher for anything at all.
 */
export function resolveMenuUrl(
  base: string, pattern: string, year: number, week: number
): string | null {
  if (!isSafeMenuBase(base)) return null;
  const filled = expandPattern(pattern, year, week).trim();
  if (!filled || filled.includes('..')) return null;

  const root = base.endsWith('/') ? base : base + '/';
  let url: URL;
  try {
    url = new URL(filled, root);
  } catch {
    return null;
  }
  if (!url.href.startsWith(root)) return null;
  return isSafeMenuBase(url.href) ? url.href : null;
}
