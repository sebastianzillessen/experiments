import type { PackingItem, Trip, TripItem } from "../types";

export function isItemRelevantForTrip(item: PackingItem, trip: Trip): boolean {
  if (item.conditions.length === 0) return true;
  return item.conditions.some((c) => trip.conditions.includes(c));
}

export function calculateQuantity(
  item: Pick<PackingItem, "baseQuantity" | "unit" | "washable">,
  trip: Pick<Trip, "durationDays" | "hasWasher" | "washIntervalDays">,
): number {
  if (item.unit === "per_trip") return item.baseQuantity;
  const canWash =
    trip.hasWasher && item.washable && trip.washIntervalDays != null && trip.washIntervalDays > 0;
  const effectiveDays = canWash
    ? Math.min(trip.durationDays, trip.washIntervalDays! + 1)
    : trip.durationDays;
  return Math.max(1, item.baseQuantity * effectiveDays);
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
  return templates
    .filter((item) => isItemRelevantForTrip(item, trip))
    .filter((item) => !excludeKeys || !excludeKeys.has(matchKey(item)))
    .map((item) => ({
      tripId: trip.id,
      familyId: trip.familyId,
      personId: item.personId,
      name: item.name,
      category: item.category,
      baseQuantity: item.baseQuantity,
      unit: item.unit,
      washable: item.washable,
      quantity: calculateQuantity(item, trip),
      sortOrder: item.sortOrder,
    }));
}

export function matchKey(
  item: Pick<PackingItem | TripItem, "name" | "category" | "personId">,
): string {
  return `${item.name.trim().toLowerCase()}|${item.category.trim().toLowerCase()}|${item.personId ?? ""}`;
}

export function formatInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function daysBetween(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return undefined;
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff + 1 : undefined;
}
