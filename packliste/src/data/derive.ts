import type { PackingItem, Person, Trip, TripItem } from "../types";

export function isItemRelevantForTrip(item: PackingItem, trip: Trip): boolean {
  // Items ohne Bedingungen sind "Sonderbedarf" — sie wurden manuell für
  // einen Trip ergänzt (z.B. via QuickAdd) und sind nicht Teil der
  // Standard-Vorlage. Sie tauchen NICHT auf neuen Trips auf.
  // Standard-Items haben die "default"-Bedingung; sie erscheinen, wenn
  // beim Trip-Anlegen "Standard" (default-Pre-Selected) gewählt ist.
  if (item.conditions.length === 0) return false;
  return item.conditions.some((c) => trip.conditions.includes(c));
}

export function calculateQuantity(
  item: Pick<PackingItem, "baseQuantity" | "unit" | "washable" | "perDays">,
  trip: Pick<Trip, "durationDays" | "hasWasher" | "washIntervalDays">,
): number {
  if (item.unit === "per_trip") return Math.max(1, item.baseQuantity);
  // Kleidung wird pro Übernachtung gerechnet, nicht pro Kalendertag: am
  // Anreisetag trägt man die Sachen von zuhause, daher zählt die Anzahl der
  // Nächte (durationDays − 1), mindestens 1. So ergibt ein Übernacht-Trip
  // (20.–21. Juni = 1 Nacht) genau 1 Boxershort statt 2.
  const nights = Math.max(1, trip.durationDays - 1);
  const canWash =
    trip.hasWasher && item.washable && trip.washIntervalDays != null && trip.washIntervalDays > 0;
  const effectiveDays = canWash
    ? Math.min(nights, trip.washIntervalDays! + 1)
    : nights;
  // Frequenz: 1 = täglich, 3 = alle 3 Tage. Wir runden immer auf —
  // 7 Tage / 3 Tage Intervall = 3 Stück (ceil), nicht 2.
  const interval = Math.max(1, item.perDays ?? 1);
  const cycles = Math.ceil(effectiveDays / interval);
  return Math.max(1, item.baseQuantity * cycles);
}

export type TripItemSeed = Omit<
  TripItem,
  "id" | "packedQty" | "isPacked" | "lastPackedBy" | "lastPackedAt"
>;

export function generateTripItems(
  templates: PackingItem[],
  trip: Trip,
  excludeKeys?: Set<string>,
): TripItemSeed[] {
  const seeds: TripItemSeed[] = [];
  // Welche Personen reisen mit? undefined = keine Einschränkung (alle).
  const tripPersons = trip.personIds;
  for (const item of templates) {
    if (!isItemRelevantForTrip(item, trip)) continue;
    let assigned = item.personIds;
    if (tripPersons) {
      assigned = assigned.filter((pid) => tripPersons.includes(pid));
      // Item war Personen zugewiesen, aber keine davon reist mit → das
      // Item ganz weglassen (kein versehentliches "Gemeinsam"-Fallback).
      if (item.personIds.length > 0 && assigned.length === 0) continue;
    }
    // 1:N — eine TripItem-Row pro mitreisender Person, oder eine
    // "Gemeinsam"-Row wenn keine Person zugewiesen ist.
    const targets: (string | undefined)[] =
      assigned.length === 0 ? [undefined] : assigned;
    const qty = calculateQuantity(item, trip);
    for (const personId of targets) {
      const seed: TripItemSeed = {
        tripId: trip.id,
        familyId: trip.familyId,
        personId,
        name: item.name,
        category: item.category,
        baseQuantity: item.baseQuantity,
        unit: item.unit,
        perDays: item.perDays,
        washable: item.washable,
        quantity: qty,
        sortOrder: item.sortOrder,
      };
      if (excludeKeys && excludeKeys.has(matchKey(seed))) continue;
      seeds.push(seed);
    }
  }
  return seeds;
}

// ---- Fuzzy matching for category autocomplete ----

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "s");
}

/**
 * Findet den ähnlichsten Eintrag aus `candidates` für `input`. Liefert
 * null wenn nichts ausreichend ähnlich ist oder bei Exact-Match
 * (kein Vorschlag nötig — der User hat den Namen schon richtig getippt).
 *
 * Bonus-Logik:
 * - Prefix-Überlappung (Plural/Singular wie "Kleidung"/"Kleider"): -2
 * - Substring-Treffer ("Hose" in "Lange Hose"): -3
 * Toleranz: ceil(maxLen/3), mindestens 2 Distanzpunkte.
 */
function fuzzyMatchByKey<T>(
  input: string,
  items: T[],
  getKey: (t: T) => string,
): T | null {
  const target = normalize(input);
  if (!target) return null;
  for (const it of items) {
    if (normalize(getKey(it)) === target) return null; // Exact-Match, kein Vorschlag
  }
  let best: { item: T; score: number } | null = null;
  for (const it of items) {
    const cnorm = normalize(getKey(it));
    if (!cnorm) continue;
    let d = levenshtein(target, cnorm);
    if (cnorm.startsWith(target) || target.startsWith(cnorm)) {
      d = Math.max(0, d - 2);
    } else if (cnorm.includes(target) || target.includes(cnorm)) {
      d = Math.max(0, d - 3);
    }
    if (!best || d < best.score) best = { item: it, score: d };
  }
  if (!best) return null;
  const maxLen = Math.max(target.length, normalize(getKey(best.item)).length);
  const threshold = Math.max(2, Math.ceil(maxLen / 3));
  return best.score <= threshold ? best.item : null;
}

export function fuzzyMatchCategory(input: string, candidates: string[]): string | null {
  return fuzzyMatchByKey(input, candidates, (c) => c);
}

/**
 * Findet ein bestehendes Template-Item, das namentlich ähnlich genug zum
 * Input ist. Nutzt fuzzyMatchByKey unter der Haube — gleiche Toleranz,
 * gleiche Prefix/Substring-Boni.
 */
export function fuzzyMatchItem<T extends { name: string }>(
  input: string,
  items: T[],
): T | null {
  return fuzzyMatchByKey(input, items, (i) => i.name);
}

export function matchKey(
  item: Pick<TripItem, "name" | "category" | "personId">,
): string {
  return `${item.name.trim().toLowerCase()}|${item.category.trim().toLowerCase()}|${item.personId ?? ""}`;
}

/**
 * 1 Buchstabe bei Einwort-Namen (Anna → A), 2 Buchstaben bei
 * Mehrwort-Namen (Anna Maria → AM, Sebastian Z. → SZ). Familien
 * brauchen selten mehr als 2 Initialen zur Unterscheidung.
 */
export function formatInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Bevorzugt explizit gesetzte Initialen, fällt sonst auf Auto-Berechnung
 * aus dem Namen zurück. Damit funktionieren bestehende Persons ohne
 * gespeichertes initials-Feld weiterhin.
 */
export function personInitials(p: Pick<Person, "name" | "initials">): string {
  const explicit = p.initials?.trim();
  if (explicit) return explicit.toUpperCase();
  return formatInitials(p.name);
}

export function daysBetween(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return undefined;
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff + 1 : undefined;
}
