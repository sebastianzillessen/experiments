import type { PackingItem, PresetKey } from "./types";

export const DEFAULT_CONDITION_KEYS = [
  "rain",
  "sun",
  "cold",
  "bathing",
  "hiking",
  "formal",
  "car",
  "flight",
] as const;

type SeedItem = Omit<PackingItem, "id" | "familyId" | "personIds" | "sortOrder">;

const beachItems: SeedItem[] = [
  { name: "Sonnencreme", category: "Hygiene", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["sun", "bathing"] },
  { name: "After-Sun-Lotion", category: "Hygiene", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["sun"] },
  { name: "Sonnenbrille", category: "Accessoires", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["sun"] },
  { name: "Sonnenhut", category: "Accessoires", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["sun"] },
  { name: "Badehose / Bikini", category: "Kleidung", baseQuantity: 1, unit: "per_trip", washable: true, conditions: ["bathing"] },
  { name: "Strandtuch", category: "Kleidung", baseQuantity: 1, unit: "per_trip", washable: true, conditions: ["bathing"] },
  { name: "Flip-Flops", category: "Schuhe", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["bathing", "sun"] },
  { name: "T-Shirt", category: "Kleidung", baseQuantity: 1, unit: "per_day", washable: true, conditions: [] },
  { name: "Unterhose", category: "Kleidung", baseQuantity: 1, unit: "per_day", washable: true, conditions: [] },
  { name: "Socken", category: "Kleidung", baseQuantity: 1, unit: "per_day", washable: true, conditions: [] },
  { name: "Zahnbürste", category: "Hygiene", baseQuantity: 1, unit: "per_trip", washable: false, conditions: [] },
  { name: "Zahnpasta", category: "Hygiene", baseQuantity: 1, unit: "per_trip", washable: false, conditions: [] },
  { name: "Ladegerät", category: "Technik", baseQuantity: 1, unit: "per_trip", washable: false, conditions: [] },
  { name: "Reisepass / ID", category: "Dokumente", baseQuantity: 1, unit: "per_trip", washable: false, conditions: [] },
  { name: "Buch", category: "Sonstiges", baseQuantity: 1, unit: "per_trip", washable: false, conditions: [] },
];

const skiItems: SeedItem[] = [
  { name: "Skijacke", category: "Kleidung", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["cold"] },
  { name: "Skihose", category: "Kleidung", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["cold"] },
  { name: "Skihandschuhe", category: "Accessoires", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["cold"] },
  { name: "Mütze", category: "Accessoires", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["cold"] },
  { name: "Skibrille", category: "Accessoires", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["cold"] },
  { name: "Helm", category: "Accessoires", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["cold"] },
  { name: "Thermo-Unterwäsche", category: "Kleidung", baseQuantity: 2, unit: "per_trip", washable: true, conditions: ["cold"] },
  { name: "Skisocken", category: "Kleidung", baseQuantity: 1, unit: "per_day", washable: true, conditions: ["cold"] },
  { name: "Lippenpflege", category: "Hygiene", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["cold", "sun"] },
  { name: "Pullover", category: "Kleidung", baseQuantity: 2, unit: "per_trip", washable: true, conditions: ["cold"] },
  { name: "T-Shirt", category: "Kleidung", baseQuantity: 1, unit: "per_day", washable: true, conditions: [] },
  { name: "Unterhose", category: "Kleidung", baseQuantity: 1, unit: "per_day", washable: true, conditions: [] },
  { name: "Socken", category: "Kleidung", baseQuantity: 1, unit: "per_day", washable: true, conditions: [] },
  { name: "Zahnbürste", category: "Hygiene", baseQuantity: 1, unit: "per_trip", washable: false, conditions: [] },
  { name: "Zahnpasta", category: "Hygiene", baseQuantity: 1, unit: "per_trip", washable: false, conditions: [] },
  { name: "Ladegerät", category: "Technik", baseQuantity: 1, unit: "per_trip", washable: false, conditions: [] },
  { name: "Reisepass / ID", category: "Dokumente", baseQuantity: 1, unit: "per_trip", washable: false, conditions: [] },
  { name: "Wanderschuhe", category: "Schuhe", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["hiking"] },
];

const cityItems: SeedItem[] = [
  { name: "Hemd / Bluse", category: "Kleidung", baseQuantity: 1, unit: "per_trip", washable: true, conditions: ["formal"] },
  { name: "Sakko / Blazer", category: "Kleidung", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["formal"] },
  { name: "Bequeme Schuhe", category: "Schuhe", baseQuantity: 1, unit: "per_trip", washable: false, conditions: [] },
  { name: "Regenjacke", category: "Kleidung", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["rain"] },
  { name: "Regenschirm", category: "Accessoires", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["rain"] },
  { name: "Reisepass / ID", category: "Dokumente", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["flight"] },
  { name: "Boarding-Pass / Ticket", category: "Dokumente", baseQuantity: 1, unit: "per_trip", washable: false, conditions: ["flight"] },
  { name: "T-Shirt", category: "Kleidung", baseQuantity: 1, unit: "per_day", washable: true, conditions: [] },
  { name: "Unterhose", category: "Kleidung", baseQuantity: 1, unit: "per_day", washable: true, conditions: [] },
  { name: "Socken", category: "Kleidung", baseQuantity: 1, unit: "per_day", washable: true, conditions: [] },
  { name: "Zahnbürste", category: "Hygiene", baseQuantity: 1, unit: "per_trip", washable: false, conditions: [] },
  { name: "Ladegerät", category: "Technik", baseQuantity: 1, unit: "per_trip", washable: false, conditions: [] },
];

export const TEMPLATE_PRESETS: Record<PresetKey, SeedItem[]> = {
  empty: [],
  beach: beachItems,
  ski: skiItems,
  city: cityItems,
};
