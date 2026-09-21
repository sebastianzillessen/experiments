// The 26 cantons, and what a family has made of them.
//
// The list is a constant, not a table: it last changed in 1979, and a copy in
// the database would only be something else to keep in step. What belongs to
// the family are the trips — a canton is visited when one of its trips is
// ticked off, which keeps "where have we been" and "what did we do there" as
// one answer instead of two that can disagree.

import type { Trip } from './types.ts';

export type Canton = { code: string; name: string };

/** Alphabetical by German name — the order someone scans a list in. */
export const CANTONS: Canton[] = [
  { code: 'AG', name: 'Aargau' },
  { code: 'AR', name: 'Appenzell Ausserrhoden' },
  { code: 'AI', name: 'Appenzell Innerrhoden' },
  { code: 'BL', name: 'Basel-Landschaft' },
  { code: 'BS', name: 'Basel-Stadt' },
  { code: 'BE', name: 'Bern' },
  { code: 'FR', name: 'Freiburg' },
  { code: 'GE', name: 'Genf' },
  { code: 'GL', name: 'Glarus' },
  { code: 'GR', name: 'Graubünden' },
  { code: 'JU', name: 'Jura' },
  { code: 'LU', name: 'Luzern' },
  { code: 'NE', name: 'Neuenburg' },
  { code: 'NW', name: 'Nidwalden' },
  { code: 'OW', name: 'Obwalden' },
  { code: 'SG', name: 'St. Gallen' },
  { code: 'SH', name: 'Schaffhausen' },
  { code: 'SZ', name: 'Schwyz' },
  { code: 'SO', name: 'Solothurn' },
  { code: 'TI', name: 'Tessin' },
  { code: 'TG', name: 'Thurgau' },
  { code: 'UR', name: 'Uri' },
  { code: 'VD', name: 'Waadt' },
  { code: 'VS', name: 'Wallis' },
  { code: 'ZG', name: 'Zug' },
  { code: 'ZH', name: 'Zürich' },
];

export const CANTON_CODES: string[] = CANTONS.map(c => c.code);

export function cantonName(code: string): string {
  return CANTONS.find(c => c.code === code)?.name ?? code;
}

/** Where a canton stands: been there, something in the diary, or nothing yet. */
export type CantonState = 'besucht' | 'geplant' | 'offen';

export function tripsOf(trips: Trip[], canton: string): Trip[] {
  return trips.filter(t => t.canton === canton);
}

export function cantonState(trips: Trip[], canton: string): CantonState {
  const mine = tripsOf(trips, canton);
  if (mine.some(t => t.done)) return 'besucht';
  return mine.length ? 'geplant' : 'offen';
}

export function visitedCantons(trips: Trip[]): Set<string> {
  return new Set(trips.filter(t => t.done).map(t => t.canton));
}

/** How far along the year's plan is. */
export function progress(trips: Trip[]): { visited: number; planned: number; total: number } {
  const visited = visitedCantons(trips);
  const planned = new Set(
    trips.filter(t => !t.done && !visited.has(t.canton)).map(t => t.canton)
  );
  return { visited: visited.size, planned: planned.size, total: CANTONS.length };
}

/**
 * Trips in the order they matter: what is still open first, soonest date
 * first, then everything already done, most recent first. A trip with no date
 * sits behind the dated ones — it is an intention, not an appointment.
 */
export function sortTrips(trips: Trip[]): Trip[] {
  return trips.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return (b.doneOn ?? '').localeCompare(a.doneOn ?? '');
    if (!a.fromDate && !b.fromDate) return a.title.localeCompare(b.title);
    if (!a.fromDate) return 1;
    if (!b.fromDate) return -1;
    return a.fromDate.localeCompare(b.fromDate);
  });
}

/** The next trip with a date that has not happened yet, across all cantons. */
export function nextTrip(trips: Trip[], today: string): Trip | null {
  return trips
    .filter(t => !t.done && t.fromDate && t.fromDate >= today)
    .sort((a, b) => (a.fromDate ?? '').localeCompare(b.fromDate ?? ''))[0] ?? null;
}

/** How many nights a trip spans; 0 is a day trip. */
export function nights(trip: Trip): number {
  if (!trip.fromDate || !trip.toDate) return 0;
  return Math.round(
    (Date.parse(trip.toDate) - Date.parse(trip.fromDate)) / 86_400_000
  );
}

const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni',
  'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

function dayMonth(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${d}. ${MONTHS[m - 1]}`;
}

/** "3. Okt." for one day, "3.–4. Okt." inside a month, "31. Okt. – 2. Nov." across. */
export function tripDates(trip: Trip): string {
  if (!trip.fromDate) return trip.done ? (trip.doneOn ? dayMonth(trip.doneOn) : 'ohne Datum') : 'ohne Datum';
  if (!trip.toDate || trip.toDate === trip.fromDate) return dayMonth(trip.fromDate);
  const [, fromMonth] = trip.fromDate.split('-').map(Number);
  const [, toMonth, toDay] = trip.toDate.split('-').map(Number);
  if (fromMonth === toMonth) {
    const fromDay = Number(trip.fromDate.split('-')[2]);
    return `${fromDay}.–${toDay}. ${MONTHS[toMonth - 1]}`;
  }
  return `${dayMonth(trip.fromDate)} – ${dayMonth(trip.toDate)}`;
}

export function durationLabel(duration: 'tag' | 'zwei-tage'): string {
  return duration === 'zwei-tage' ? 'Zwei Tage' : 'Tagesausflug';
}
