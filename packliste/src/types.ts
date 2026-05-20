export type QuantityUnit = "per_day" | "per_trip";
export type FamilyRole = "owner" | "member";

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Family {
  id: string;
  name: string;
  createdAt: string;
}

export interface Member {
  userId: string;
  familyId: string;
  role: FamilyRole;
  fullName: string;
  initials: string;
}

export interface Person {
  id: string;
  familyId: string;
  name: string;
  color?: string;
  /**
   * 1–3 Buchstaben für Avatar-Badges. Beim Anlegen automatisch aus dem
   * Namen berechnet (1 Buchstabe bei Einwort-Namen, 2 bei Mehrwort).
   * Im Edit-Modus überschreibbar.
   */
  initials?: string;
  /**
   * Markiert das Familienmitglied als Haustier. Bei "Alle Personen"-
   * Multi-Select werden Haustiere nicht automatisch mit-selektiert
   * (manuell wählbar wie eine normale Person).
   */
  isPet?: boolean;
  linkedUserId?: string;
  sortOrder: number;
}

export interface Condition {
  key: string;
  label: string;
  isCustom: boolean;
}

export interface Category {
  id: string;
  familyId: string;
  /** Anzeigename — wird auch als Match-Key für packing_items.category genutzt. */
  name: string;
  /** Emoji (1-2 Zeichen). Überschreibt das Auto-Mapping aus labels.ts. */
  icon?: string;
  sortOrder: number;
}

export interface PackingItem {
  id: string;
  familyId: string;
  /**
   * Liste der Personen, denen das Item zugewiesen ist. Leeres Array =
   * gemeinsam/familien-weit. Beim Trip-Anlegen wird das Item für jede
   * eingetragene Person zu einer eigenen TripItem-Row expandiert (1:N).
   */
  personIds: string[];
  name: string;
  category: string;
  baseQuantity: number;
  unit: QuantityUnit;
  /**
   * Frequenz für per_day-Items: 1 = täglich, 3 = alle 3 Tage, etc.
   * undefined wird wie 1 behandelt (backwards-compat).
   * Wird ignoriert wenn unit = per_trip.
   */
  perDays?: number;
  washable: boolean;
  conditions: string[];
  sortOrder: number;
}

export interface Trip {
  id: string;
  familyId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  durationDays: number;
  conditions: string[];
  hasWasher: boolean;
  washIntervalDays?: number;
  archivedAt?: string;
  createdBy: string;
  createdAt: string;
}

export interface TripItem {
  id: string;
  tripId: string;
  familyId: string;
  personId?: string;
  name: string;
  category: string;
  baseQuantity: number;
  unit: QuantityUnit;
  perDays?: number;
  washable: boolean;
  quantity: number;
  packedQty: number;
  isPacked: boolean;
  lastPackedBy?: string;
  lastPackedAt?: string;
  sortOrder: number;
}

export type PresetKey = "empty" | "beach" | "ski" | "city";
