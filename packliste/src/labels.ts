import type { QuantityUnit, FamilyRole, PresetKey } from "./types";

export const CONDITION_LABELS: Record<string, { label: string; emoji: string }> = {
  default: { label: "Standard", emoji: "📋" },
  rain: { label: "Regen", emoji: "🌧" },
  sun: { label: "Sonne / Hitze", emoji: "☀️" },
  cold: { label: "Kälte", emoji: "🥶" },
  bathing: { label: "Schwimmen", emoji: "🏊" },
  hiking: { label: "Wandern", emoji: "🥾" },
  formal: { label: "Festlich", emoji: "👔" },
  car: { label: "Autoreise", emoji: "🚗" },
  flight: { label: "Flug", emoji: "✈️" },
};

export const UNIT_LABELS: Record<QuantityUnit, string> = {
  per_day: "pro Tag",
  per_trip: "pro Trip",
};

export const ROLE_LABELS: Record<FamilyRole, string> = {
  owner: "Owner",
  member: "Mitglied",
};

export const PRESET_LABELS: Record<PresetKey, { label: string; emoji: string; meta: string }> = {
  empty: { label: "Leer starten", emoji: "📋", meta: "Nur die Bedingungen" },
  beach: { label: "Strand-Wochenende", emoji: "🏖️", meta: "Sonne · Schwimmen" },
  ski: { label: "Skiferien", emoji: "🎿", meta: "Kälte · Schnee" },
  city: { label: "Städtetrip", emoji: "🏛️", meta: "Festlich · Flug" },
};

export const PERSON_COLORS = [
  "#d97743",
  "#4a8a4a",
  "#2b5d8b",
  "#8a4a8a",
  "#b88a2c",
  "#5a8a8a",
  "#b8453e",
  "#4a5a8a",
];

export function conditionLabel(key: string, customs: { key: string; label: string }[]): string {
  if (CONDITION_LABELS[key]) return CONDITION_LABELS[key].label;
  return customs.find((c) => c.key === key)?.label ?? key;
}

export function conditionEmoji(key: string): string {
  return CONDITION_LABELS[key]?.emoji ?? "🏷️";
}

/**
 * Best-effort Mapping von Kategorie-Namen (deutsch, freitext) zu Emojis.
 * Match ist case-insensitive und auf den "Kern" des Worts begrenzt (z.B.
 * "Kleider" und "Kleidung" werden beide auf 👕 gemappt, weil sie beide
 * "kleid" beginnen). Fallback ist ein generisches Tag-Icon.
 */
const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/^kleid/, "👕"],
  [/(hose|trousers)/, "👖"],
  [/^schuh|^schuhe|sneaker|wander/, "👟"],
  [/^hygien|toilet|pflege|kosmetik/, "🧴"],
  [/^accessoir|brille|hut|m[uü]tze|schmuck/, "🕶️"],
  [/^technik|elektro|kabel|ladeger|charger/, "🔌"],
  [/^dokument|pass|ticket|reise(pass)?|ausweis/, "📄"],
  [/^essen|verpfleg|snack|food/, "🍽️"],
  [/^medi|apoth|pharma/, "💊"],
  [/^spielzeug|toy|kind|baby/, "🧸"],
  [/^haust|tier|hund|katz/, "🐾"],
  [/^outdoor|camp|zelt/, "🏕️"],
  [/^sport|fitness|bike|fahrrad/, "🚴"],
  [/^buch|read/, "📚"],
  [/^sonst|misc|other/, "📦"],
];

export function categoryIcon(category: string): string {
  const norm = category.trim().toLowerCase();
  if (!norm) return "📦";
  for (const [pattern, emoji] of CATEGORY_PATTERNS) {
    if (pattern.test(norm)) return emoji;
  }
  return "🏷️";
}
