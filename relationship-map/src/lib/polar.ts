import type { Category, MapPerson } from "../types.ts";

export interface NodeLayout {
  person: MapPerson;
  x: number;
  y: number;
  /** Distance from centre (px). */
  radius: number;
  color: string;
}

export interface LayoutResult {
  cx: number;
  cy: number;
  nodes: NodeLayout[];
  /** Concentric guide rings (radius + rating label). */
  rings: Array<{ radius: number; rating: number }>;
}

const TWO_PI = Math.PI * 2;

/** Map a 1–10 rating to a distance from the centre (10 = closest). */
export function ratingToRadius(
  rating: number,
  rMin: number,
  rMax: number,
): number {
  const clamped = Math.max(1, Math.min(10, rating));
  return rMin + ((10 - clamped) / 9) * (rMax - rMin);
}

/**
 * Compute a deterministic radial layout: people are grouped into arcs by
 * category, spread evenly within their arc, and placed at a distance that
 * encodes closeness.
 */
export function computeLayout(
  people: MapPerson[],
  categories: Category[],
  size: number,
): LayoutResult {
  const cx = size / 2;
  const cy = size / 2;
  const rMin = size * 0.12;
  const rMax = size * 0.44;

  const colorById = new Map(categories.map((c) => [c.id, c.color]));
  const orderById = new Map(categories.map((c, i) => [c.id, i]));

  // Group by category, preserving category sort order then person id.
  const groups = new Map<number, MapPerson[]>();
  for (const p of [...people].sort((a, b) => a.id - b.id)) {
    const list = groups.get(p.category_id) ?? [];
    list.push(p);
    groups.set(p.category_id, list);
  }

  const presentCategories = [...groups.keys()].sort(
    (a, b) => (orderById.get(a) ?? a) - (orderById.get(b) ?? b),
  );

  const total = people.length || 1;
  const nodes: NodeLayout[] = [];
  let angleCursor = -Math.PI / 2; // start at the top

  for (const catId of presentCategories) {
    const members = groups.get(catId)!;
    const arc = (members.length / total) * TWO_PI;
    members.forEach((person, i) => {
      // Spread members within the arc, leaving padding so groups read apart.
      const frac = (i + 0.5) / members.length;
      const angle = angleCursor + frac * arc;
      const radius = ratingToRadius(person.rating, rMin, rMax);
      nodes.push({
        person,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        radius,
        color: colorById.get(person.category_id) ?? "#94a3b8",
      });
    });
    angleCursor += arc;
  }

  const rings = [2, 4, 6, 8, 10].map((rating) => ({
    rating,
    radius: ratingToRadius(rating, rMin, rMax),
  }));

  return { cx, cy, nodes, rings };
}
