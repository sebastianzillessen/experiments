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
  linkedUserId?: string;
  sortOrder: number;
}

export interface Condition {
  key: string;
  label: string;
  isCustom: boolean;
}

export interface PackingItem {
  id: string;
  familyId: string;
  personId?: string;
  name: string;
  category: string;
  baseQuantity: number;
  unit: QuantityUnit;
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
  washable: boolean;
  quantity: number;
  packedQty: number;
  isPacked: boolean;
  lastPackedBy?: string;
  lastPackedAt?: string;
  sortOrder: number;
}

export type PresetKey = "empty" | "beach" | "ski" | "city";
