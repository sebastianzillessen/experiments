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
const TOP = -Math.PI / 2; // angle at the top of the circle
/** Imported people start here; this bucket gets no wedge and spreads full-circle. */
export const UNCATEGORISED = "Uncategorised";

/** Map a 1–10 rating to a distance from the centre (10 = closest). */
export function ratingToRadius(rating: number, rMin: number, rMax: number): number {
  const clamped = Math.max(1, Math.min(10, rating));
  return rMin + ((10 - clamped) / 9) * (rMax - rMin);
}

/** Inverse of ratingToRadius: a drop distance becomes a 1–10 rating. */
export function radiusToRating(radius: number, rMin: number, rMax: number): number {
  const frac = (radius - rMin) / (rMax - rMin);
  const rating = 10 - Math.max(0, Math.min(1, frac)) * 9;
  return Math.max(1, Math.min(10, Math.round(rating)));
}

/** Categories that own a wedge (everything except the uncategorised bucket). */
export function wedgeCategories(categories: Category[]): Category[] {
  const real = categories.filter((c) => c.name !== UNCATEGORISED);
  return real.length > 0 ? real : categories;
}

const sizing = (size: number) => ({
  cx: size / 2,
  cy: size / 2,
  rMin: size * 0.12,
  rMax: size * 0.44,
});

/** The 1–10 rating implied by a drop point's distance from the centre. */
export function ratingAtPoint(x: number, y: number, size: number): number {
  const { cx, cy, rMin, rMax } = sizing(size);
  return radiusToRating(Math.hypot(x - cx, y - cy), rMin, rMax);
}

/** Which wedge category an absolute (x, y) drop point falls into. */
export function categoryAtPoint(
  x: number,
  y: number,
  categories: Category[],
  size: number,
): Category {
  const { cx, cy } = sizing(size);
  const wedges = wedgeCategories(categories);
  const wedgeArc = TWO_PI / wedges.length;
  // Angle from the top, clockwise, in [0, 2π).
  let a = Math.atan2(y - cy, x - cx) - TOP;
  a = ((a % TWO_PI) + TWO_PI) % TWO_PI;
  return wedges[Math.min(wedges.length - 1, Math.floor(a / wedgeArc))]!;
}

/**
 * Radial layout. Categories with a wedge spread their members inside a fixed
 * angular slice; uncategorised people fan out across the whole circle so they
 * stay readable until dragged into a wedge. Distance always encodes rating.
 */
export function computeLayout(
  people: MapPerson[],
  categories: Category[],
  size: number,
): LayoutResult {
  const { cx, cy, rMin, rMax } = sizing(size);
  const colorById = new Map(categories.map((c) => [c.id, c.color]));
  const wedges = wedgeCategories(categories);
  const wedgeArc = TWO_PI / wedges.length;
  const wedgeIndex = new Map(wedges.map((c, i) => [c.id, i]));
  const PAD = wedgeArc * 0.12; // gap so adjacent wedges read apart

  const nodes: NodeLayout[] = [];
  const place = (person: MapPerson, angle: number) => {
    const radius = ratingToRadius(person.rating, rMin, rMax);
    nodes.push({
      person,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      radius,
      color: colorById.get(person.category_id) ?? "#94a3b8",
    });
  };

  // Group people by whether their category owns a wedge.
  const byWedge = new Map<number, MapPerson[]>();
  const uncategorised: MapPerson[] = [];
  for (const p of [...people].sort((a, b) => a.id - b.id)) {
    if (wedgeIndex.has(p.category_id)) {
      const list = byWedge.get(p.category_id) ?? [];
      list.push(p);
      byWedge.set(p.category_id, list);
    } else {
      uncategorised.push(p);
    }
  }

  for (const [catId, members] of byWedge) {
    const start = TOP + wedgeIndex.get(catId)! * wedgeArc + PAD / 2;
    const span = wedgeArc - PAD;
    members.forEach((person, i) => {
      place(person, start + ((i + 0.5) / members.length) * span);
    });
  }
  uncategorised.forEach((person, i) => {
    place(person, TOP + ((i + 0.5) / uncategorised.length) * TWO_PI);
  });

  const rings = [2, 4, 6, 8, 10].map((rating) => ({
    rating,
    radius: ratingToRadius(rating, rMin, rMax),
  }));

  return { cx, cy, nodes, rings };
}
