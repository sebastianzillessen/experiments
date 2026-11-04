import type { MapPerson } from "../types.ts";

export interface MapFilters {
  /** Category ids whose people are hidden from the map. */
  hiddenGroups: number[];
  /** Only show people whose rating is at least this (1 = show all). */
  minRating: number;
  /** Show only the N closest of what remains, or null for no cap. */
  topN: number | null;
}

export const NO_FILTERS: MapFilters = { hiddenGroups: [], minRating: 1, topN: null };

/**
 * Apply the active map filters. Group + closeness filter first, then topN keeps
 * the closest of whatever survives. Pure so it's trivially testable.
 */
export function applyFilters(people: MapPerson[], filters: MapFilters): MapPerson[] {
  const hidden = new Set(filters.hiddenGroups);
  let result = people.filter(
    (p) => !hidden.has(p.category_id) && p.rating >= filters.minRating,
  );
  if (filters.topN != null) {
    result = [...result].sort((a, b) => b.rating - a.rating).slice(0, filters.topN);
  }
  return result;
}
