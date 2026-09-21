// Places a family wants to get through, and what it has made of them.
//
// This started as the 26 cantons in a constant, which was right for the family
// that asked and wrong for everyone else: the next one wants the countries of
// Europe. So the list lives in the database and belongs to the family — the
// cantons are one starting point among several, not the shape of the feature.
//
// A destination is visited when one of its trips is ticked off. Nothing stores
// "visited" separately: a flag beside the trips is a second truth to keep in
// step, and the trip already says when it was and what it was.

import type { Destination, Trip } from './types.ts';

/** Where a destination stands: been there, something planned, or nothing yet. */
export type DestinationState = 'besucht' | 'geplant' | 'offen';

export function tripsOf(trips: Trip[], destinationId: string): Trip[] {
  return trips.filter(t => t.destinationId === destinationId);
}

export function destinationState(trips: Trip[], destinationId: string): DestinationState {
  const mine = tripsOf(trips, destinationId);
  if (mine.some(t => t.done)) return 'besucht';
  return mine.length ? 'geplant' : 'offen';
}

/** The groups a family is working through, in the order they were started. */
export function groupsOf(destinations: Destination[]): string[] {
  const seen: string[] = [];
  for (const d of destinations) if (!seen.includes(d.group)) seen.push(d.group);
  return seen;
}

export function inGroup(destinations: Destination[], group: string | null): Destination[] {
  return group === null ? destinations : destinations.filter(d => d.group === group);
}

/** How far along a list is. Counted over destinations, never over trips. */
export function progress(
  destinations: Destination[], trips: Trip[]
): { visited: number; planned: number; total: number } {
  let visited = 0;
  let planned = 0;
  for (const d of destinations) {
    const state = destinationState(trips, d.id);
    if (state === 'besucht') visited++;
    else if (state === 'geplant') planned++;
  }
  return { visited, planned, total: destinations.length };
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

/** The next trip with a date that has not happened yet. */
export function nextTrip(trips: Trip[], today: string): Trip | null {
  return trips
    .filter(t => !t.done && t.fromDate && t.fromDate >= today)
    .sort((a, b) => (a.fromDate ?? '').localeCompare(b.fromDate ?? ''))[0] ?? null;
}

/** How many nights a trip spans; 0 is a day trip. */
export function nights(trip: Trip): number {
  if (!trip.fromDate || !trip.toDate) return 0;
  return Math.round((Date.parse(trip.toDate) - Date.parse(trip.fromDate)) / 86_400_000);
}

const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni',
  'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

function dayMonth(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${d}. ${MONTHS[m - 1]}`;
}

/** "3. Okt." for one day, "3.–4. Okt." inside a month, "31. Okt. – 2. Nov." across. */
export function tripDates(trip: Trip): string {
  if (!trip.fromDate) {
    return trip.done && trip.doneOn ? dayMonth(trip.doneOn) : 'ohne Datum';
  }
  if (!trip.toDate || trip.toDate === trip.fromDate) return dayMonth(trip.fromDate);
  const fromMonth = Number(trip.fromDate.split('-')[1]);
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

/* ---------------------------------------------------------------- starters */

export type StarterItem = { name: string; code?: string };
export type Starter = { id: string; label: string; group: string; note: string; items: StarterItem[] };

const CANTONS: StarterItem[] = [
  { name: 'Aargau', code: 'AG' }, { name: 'Appenzell Ausserrhoden', code: 'AR' },
  { name: 'Appenzell Innerrhoden', code: 'AI' }, { name: 'Basel-Landschaft', code: 'BL' },
  { name: 'Basel-Stadt', code: 'BS' }, { name: 'Bern', code: 'BE' },
  { name: 'Freiburg', code: 'FR' }, { name: 'Genf', code: 'GE' },
  { name: 'Glarus', code: 'GL' }, { name: 'Graubünden', code: 'GR' },
  { name: 'Jura', code: 'JU' }, { name: 'Luzern', code: 'LU' },
  { name: 'Neuenburg', code: 'NE' }, { name: 'Nidwalden', code: 'NW' },
  { name: 'Obwalden', code: 'OW' }, { name: 'St. Gallen', code: 'SG' },
  { name: 'Schaffhausen', code: 'SH' }, { name: 'Schwyz', code: 'SZ' },
  { name: 'Solothurn', code: 'SO' }, { name: 'Tessin', code: 'TI' },
  { name: 'Thurgau', code: 'TG' }, { name: 'Uri', code: 'UR' },
  { name: 'Waadt', code: 'VD' }, { name: 'Wallis', code: 'VS' },
  { name: 'Zug', code: 'ZG' }, { name: 'Zürich', code: 'ZH' },
];

const EUROPE: StarterItem[] = [
  { name: 'Albanien', code: 'AL' }, { name: 'Andorra', code: 'AD' },
  { name: 'Belgien', code: 'BE' }, { name: 'Bosnien und Herzegowina', code: 'BA' },
  { name: 'Bulgarien', code: 'BG' }, { name: 'Dänemark', code: 'DK' },
  { name: 'Deutschland', code: 'DE' }, { name: 'Estland', code: 'EE' },
  { name: 'Finnland', code: 'FI' }, { name: 'Frankreich', code: 'FR' },
  { name: 'Griechenland', code: 'GR' }, { name: 'Irland', code: 'IE' },
  { name: 'Island', code: 'IS' }, { name: 'Italien', code: 'IT' },
  { name: 'Kosovo', code: 'XK' }, { name: 'Kroatien', code: 'HR' },
  { name: 'Lettland', code: 'LV' }, { name: 'Liechtenstein', code: 'LI' },
  { name: 'Litauen', code: 'LT' }, { name: 'Luxemburg', code: 'LU' },
  { name: 'Malta', code: 'MT' }, { name: 'Moldau', code: 'MD' },
  { name: 'Monaco', code: 'MC' }, { name: 'Montenegro', code: 'ME' },
  { name: 'Niederlande', code: 'NL' }, { name: 'Nordmazedonien', code: 'MK' },
  { name: 'Norwegen', code: 'NO' }, { name: 'Österreich', code: 'AT' },
  { name: 'Polen', code: 'PL' }, { name: 'Portugal', code: 'PT' },
  { name: 'Rumänien', code: 'RO' }, { name: 'San Marino', code: 'SM' },
  { name: 'Schweden', code: 'SE' }, { name: 'Schweiz', code: 'CH' },
  { name: 'Serbien', code: 'RS' }, { name: 'Slowakei', code: 'SK' },
  { name: 'Slowenien', code: 'SI' }, { name: 'Spanien', code: 'ES' },
  { name: 'Tschechien', code: 'CZ' }, { name: 'Ukraine', code: 'UA' },
  { name: 'Ungarn', code: 'HU' }, { name: 'Vatikanstadt', code: 'VA' },
  { name: 'Vereinigtes Königreich', code: 'GB' }, { name: 'Weissrussland', code: 'BY' },
  { name: 'Zypern', code: 'CY' },
];

/**
 * Lists worth not typing out by hand. They are a starting point and nothing
 * more: every entry can be renamed, removed, or joined by one somebody thinks
 * belongs there — which is the whole reason the list left the code.
 */
export const STARTERS: Starter[] = [
  {
    id: 'kantone',
    label: 'Alle 26 Kantone',
    group: 'Kantone der Schweiz',
    note: 'Die Schweiz einmal ganz, von Aargau bis Zürich.',
    items: CANTONS,
  },
  {
    id: 'europa',
    label: 'Länder Europas',
    group: 'Länder Europas',
    note: '45 Länder. Wo Europa aufhört, ist Ansichtssache — die Liste lässt sich ergänzen.',
    items: EUROPE,
  },
];
