// Shared shapes. The DB uses snake_case, the UI camelCase — the mapping
// happens once, in AppContext, so nothing below has to know about Postgres.

export type Role = 'owner' | 'editor' | 'viewer';

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Bearbeiter',
  viewer: 'Betrachter',
};

/** A column of the planner: a person in the family, with or without a login. */
export type Person = {
  id: string;
  name: string;
  shortName: string | null;
  color: string;
  sortOrder: number;
  /** Extra spellings that also mark a calendar event as this person's. */
  aliases: string[];
  userId: string | null;
  archivedAt: string | null;
};

/** A connected calendar, as every member may see it (never the URL itself). */
export type Calendar = {
  id: string;
  label: string;
  kind: 'ics' | 'office365';
  color: string;
  enabled: boolean;
  /** Redacted form, e.g. "calendar.google.com/…/basic.ics". */
  urlPreview: string;
  ttlMinutes: number;
  lastSyncedAt: string | null;
  lastError: string | null;
};

/** One cached occurrence coming out of the calendar sync. */
export type CachedEvent = {
  uid: string;
  occurrence: string;
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startsAt: string | null;
  endsAt: string | null;
};

/** Manual override of the automatic name matching for one calendar event. */
export type Assignment = {
  calendarId: string;
  uid: string;
  occurrence: string | null;
  personIds: string[];
  hidden: boolean;
};

/**
 * Everything the planner renders, whether it was typed in or imported.
 * `personIds` is already resolved: empty means the shared "Familie" column.
 */
export type PlannerEvent = {
  /** Stable React key, unique across both sources. */
  key: string;
  source: 'manual' | 'calendar';
  /** fp_events.id for manual entries, null for imported ones. */
  id: string | null;
  calendarId: string | null;
  calendarLabel: string | null;
  uid: string | null;
  occurrence: string | null;
  title: string;
  notes: string;
  allDay: boolean;
  /** Inclusive local day range. */
  startDate: string;
  endDate: string;
  startsAt: string | null;
  endsAt: string | null;
  personIds: string[];
  color: string;
  /** True when personIds came from name matching rather than a person's choice. */
  autoAssigned: boolean;
};

export type Family = {
  id: string;
  name: string;
  timezone: string;
  weekStart: number;
};

export type Member = {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: Role;
};

export type OpenInvite = {
  id: string;
  role: Role;
  email: string | null;
  token: string | null;
  createdAt: string;
};

/** The shared column: events nobody in particular owns. */
export const FAMILY_COLUMN = 'family';
