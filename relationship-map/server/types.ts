// Shared API types — single source of truth, imported by both server and client.

export const CONTACT_FREQUENCIES = [
  "daily",
  "weekly",
  "monthly",
  "rarely",
  "never",
] as const;

export type ContactFrequency = (typeof CONTACT_FREQUENCIES)[number];

export interface Category {
  id: number;
  name: string;
  color: string;
  sort_order: number;
}

export interface Person {
  id: number;
  name: string;
  category_id: number;
  contact_frequency: ContactFrequency;
  current_rating: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface RatingLogEntry {
  id: number;
  person_id: number;
  old_rating: number | null;
  new_rating: number;
  changed_at: string;
  note: string | null;
}

/** A person as positioned on the map at a point in time. */
export interface MapPerson {
  id: number;
  name: string;
  category_id: number;
  contact_frequency: ContactFrequency;
  rating: number;
  archived: boolean;
}

export interface MapResponse {
  /** ISO timestamp the map represents, or null for the live map. */
  at: string | null;
  self_name: string;
  people: MapPerson[];
}

export interface TimelineResponse {
  /** Earliest change timestamp, or null when there is no history yet. */
  min: string | null;
  /** Latest change timestamp, or null when there is no history yet. */
  max: string | null;
  /** Distinct change timestamps, ascending. */
  dates: string[];
}

export type Settings = Record<string, string>;
