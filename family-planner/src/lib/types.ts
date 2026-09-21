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
  /** Takes on household tasks, so the task list offers a button for them. */
  doesTasks: boolean;
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
  /** Stable React key, unique across every source. */
  key: string;
  source: 'manual' | 'calendar' | 'menu';
  /** fp_events.id for manual entries, null for imported ones. */
  id: string | null;
  calendarId: string | null;
  /** Where an imported entry came from — a calendar, or a menu source. */
  calendarLabel: string | null;
  uid: string | null;
  occurrence: string | null;
  title: string;
  /**
   * What the chip shows: for an imported event the title minus the names of
   * the people it is filed under ("Caro LQ" in Caro's column reads "LQ").
   * The detail sheet always shows the full `title`.
   */
  displayTitle: string;
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
  /**
   * The series rule when this is one date of a recurring entry, so the detail
   * sheet can offer "this date" against "all dates". Imported events arrive
   * already expanded and carry null.
   */
  repeat: import('./recurrence.ts').RepeatRule | null;
};

/** How the family reads a clock. Applies to every time the app renders itself. */
export type TimeFormat = '24h' | '12h';

export type Family = {
  id: string;
  name: string;
  timezone: string;
  weekStart: number;
  timeFormat: TimeFormat;
  /** Swiss postal code the weather is fetched for, or null when unset. */
  weatherPlz: string | null;
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

/* ----------------------------------------------------------------- menu */

/** One colour for every imported lunch, so a menu chip reads as its own kind. */
export const MENU_COLOR = '#7a6a9e';

/** Where a school publishes its weekly lunch menu. */
export type MenuSource = {
  id: string;
  label: string;
  baseUrl: string;
  /** Tried in order until one is found. See patterns.ts for the placeholders. */
  pathPatterns: string[];
  enabled: boolean;
};

export type MenuDish = {
  name: string;
  tags: ('gluten-free' | 'lactose-free' | 'seasonal')[];
};

/** One imported week, exactly as the importer checked and stored it. */
export type MenuWeek = {
  id: string;
  sourceId: string;
  year: number;
  week: number;
  from: string;
  to: string;
  importedAt: string | null;
  days: { date: string; dishes: MenuDish[] }[];
};

/** A child who eats at that school, and on which days. */
export type MenuAssignment = {
  sourceId: string;
  personId: string;
  /** 1 = Monday … 5 = Friday, matching Date#getUTCDay() for those days. */
  weekdays: number[];
};

/** One day of the daytime forecast, as the Edge Function worked it out. */
export type WeatherDay = {
  date: string;
  tempMin: number;
  tempMax: number;
  precipitation: number;
  sunshine: number;
  hours: number;
};

/* ------------------------------------------------------------ household */

/** The three kinds of rhythm a household job actually has. */
export type TaskRhythm =
  | { kind: 'takt'; min: number; max: number; per: 'tag' | 'woche' | 'monat' }
  | { kind: 'intervall'; every: number; unit: 'tage' | 'wochen' | 'monate' }
  | { kind: 'ereignis'; trigger: string; estPerWeek: number }
  /** No rhythm at all: the days are a list, in `dates`. */
  | { kind: 'termine' };

/** What the family means to do — not what it did, which is the logs. */
export type HouseholdTask = {
  id: string;
  name: string;
  area: string;
  rhythm: TaskRhythm;
  /** Planning figure in minutes per run. */
  minutes: number;
  /** Ask for the minutes on every log, for jobs whose length swings. */
  askDuration: boolean;
  /** Every run counts for itself, rather than one tick for the whole day. */
  logEach: boolean;
  /** The work is remembering and organising it, not doing it. */
  coordination: boolean;
  /** 1 = Monday … 7 = Sunday; empty when any day will do. */
  weekdays: number[];
  /** Who normally does it; null means whoever gets to it. */
  ownerPersonId: string | null;
  active: boolean;
  sortOrder: number;
  /** The planned days, ascending, for a task whose rhythm is a list. */
  dates: TaskDate[];
};

/** One planned day, as it came out of the list someone sent. */
export type TaskDate = {
  date: string;
  /** What the line said beyond the date, when it said more. */
  note: string | null;
};

/** One run of one task, by one person. The only thing the split is built on. */
export type TaskLog = {
  id: string;
  taskId: string;
  personId: string | null;
  doneAt: string;
  minutes: number;
};

/**
 * Areas every household has, offered when there is nothing to go on yet. The
 * real list lives in fp_tasks.area and grows with the family — a flat with an
 * Airbnb in it adds "Airbnb" once and it is there from then on.
 */
export const COMMON_AREAS: { id: string; label: string }[] = [
  { id: 'haushalt', label: 'Haushalt' },
  { id: 'kueche', label: 'Küche' },
  { id: 'waesche', label: 'Wäsche' },
  { id: 'entsorgung', label: 'Entsorgung' },
  { id: 'einkauf', label: 'Einkauf' },
  { id: 'kinder', label: 'Kinder' },
  { id: 'tiere', label: 'Tiere' },
  { id: 'garten', label: 'Garten' },
];

/** An area the family typed itself is shown as typed. */
export function areaLabel(id: string): string {
  const known = COMMON_AREAS.find(a => a.id === id);
  if (known) return known.label;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/* -------------------------------------------------------------- cantons */

/** A trip to one canton: planned, done, or just an idea with a name. */
export type Trip = {
  id: string;
  canton: string;
  title: string;
  notes: string;
  fromDate: string | null;
  toDate: string | null;
  done: boolean;
  doneOn: string | null;
  /** Whether the family wrote it or took it from a suggestion. */
  source: 'eigen' | 'idee';
};

/** One suggestion from the model, as stored for a canton. */
export type TripIdea = {
  id: string;
  canton: string;
  title: string;
  summary: string;
  highlights: string[];
  duration: 'tag' | 'zwei-tage';
  season: string;
  travel: string;
  /** What was asked for when this batch was generated. */
  wishes: string;
  generatedAt: string;
};
