// Reading the school lunch menu out of the weekly PDF.
//
// The school publishes one PDF per calendar week, and the file is a SCAN: one
// JPEG per page, no text layer at all. So there is nothing to parse — the page
// goes to Claude as an image and comes back as JSON.
//
// This file holds everything around that call that can be checked without one:
// which URL a week lives at, which days a week covers, and whether what came
// back actually describes the week we asked for. A model can return
// schema-valid nonsense — dates from the wrong week, a sixth weekday, an empty
// dish — and a wrong menu on the wall is worse than none.

const DAY_MS = 86_400_000;

export type MenuTag = 'gluten-free' | 'lactose-free' | 'seasonal';

export type MenuDish = {
  name: string;
  tags: MenuTag[];
};

export type MenuDay = {
  /** yyyy-mm-dd */
  date: string;
  dishes: MenuDish[];
};

export type MenuWeek = {
  year: number;
  week: number;
  from: string;
  to: string;
  days: MenuDay[];
};

function toKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Monday = 0 … Sunday = 6, the order a planner week runs in. */
function mondayIndex(ms: number): number {
  return (new Date(ms).getUTCDay() + 6) % 7;
}

/** The Monday of ISO week `week` in `year`. */
export function mondayOfIsoWeek(year: number, week: number): string {
  const jan4 = Date.UTC(year, 0, 4);
  const week1Monday = jan4 - mondayIndex(jan4) * DAY_MS;
  return toKey(week1Monday + (week - 1) * 7 * DAY_MS);
}

/**
 * ISO 8601 week of a date. The year matters: 1 January can belong to week 52
 * of the year before, which is exactly when a menu import would silently fetch
 * the wrong file.
 */
export function isoWeek(dateKey: string): { year: number; week: number } {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = Date.UTC(y, m - 1, d);
  // The Thursday of this week decides which year the week belongs to.
  const thursday = date + (3 - mondayIndex(date)) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const week1Monday = Date.parse(mondayOfIsoWeek(year, 1));
  return { year, week: Math.round((thursday - week1Monday) / (7 * DAY_MS)) + 1 };
}

/** Monday to Friday — the menu covers school days only. */
export function schoolDays(year: number, week: number): string[] {
  const monday = Date.parse(mondayOfIsoWeek(year, week));
  return [0, 1, 2, 3, 4].map(offset => toKey(monday + offset * DAY_MS));
}

/**
 * Today where the family lives. A menu import at 01:00 on a Monday must not
 * fetch last week because the server happens to be on UTC.
 */
export function todayInZone(timeZone: string, now = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Prefilled in the settings, because it is the school this was built for. */
export const HUTTEN_DOWNLOADS =
  'https://www.stadt-zuerich.ch/content/dam/stzh/schulen/hutten/downloads/';
export const HUTTEN_PATTERNS = ['{KW}.{JJ}.pdf', '{KW2}.{JJ}.pdf'];

const TAGS: MenuTag[] = ['gluten-free', 'lactose-free', 'seasonal'];

/**
 * Check what came back against the week we asked for.
 *
 * Kept strict on purpose: a day outside the week, a repeated day or an empty
 * dish means the page was misread, and dropping those is better than showing
 * them. Throws when nothing usable is left, so the caller can say "not read"
 * rather than write an empty week.
 */
export function validateMenuWeek(raw: unknown, year: number, week: number): MenuWeek {
  const wanted = new Set(schoolDays(year, week));
  const days: MenuDay[] = [];
  const seen = new Set<string>();

  const input = (raw ?? {}) as { days?: unknown };
  if (!Array.isArray(input.days)) throw new Error('Im Menüplan wurden keine Tage erkannt');

  for (const entry of input.days) {
    const day = (entry ?? {}) as { date?: unknown; dishes?: unknown };
    if (typeof day.date !== 'string' || !wanted.has(day.date) || seen.has(day.date)) continue;

    const dishes: MenuDish[] = [];
    for (const item of Array.isArray(day.dishes) ? day.dishes : []) {
      const dish = (item ?? {}) as { name?: unknown; tags?: unknown };
      const name = typeof dish.name === 'string' ? dish.name.replace(/\s+/g, ' ').trim() : '';
      if (!name) continue;
      const tags = Array.isArray(dish.tags)
        ? TAGS.filter(tag => (dish.tags as unknown[]).includes(tag))
        : [];
      dishes.push({ name, tags });
    }
    if (dishes.length === 0) continue;

    seen.add(day.date);
    days.push({ date: day.date, dishes });
  }

  if (days.length === 0) throw new Error('Im Menüplan wurden keine Gerichte erkannt');

  days.sort((a, b) => a.date.localeCompare(b.date));
  const all = schoolDays(year, week);
  return { year, week, from: all[0], to: all[all.length - 1], days };
}
