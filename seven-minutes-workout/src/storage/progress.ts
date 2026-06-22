// Single persistence seam for the app. Today it is backed by localStorage; the
// async-shaped API means a future remote backend (email login + sync) can
// implement the same `ProgressStore` interface without touching the UI.

export type Gender = "male" | "female";

export interface Settings {
  gender: Gender;
  /** Daily reminder time, "HH:MM" (24h, local). */
  reminderTime: string;
  /** Whether the user has push reminders enabled. */
  remindersEnabled: boolean;
  /** Optional sound during the workout. */
  soundEnabled: boolean;
}

export interface WorkoutSession {
  /** ISO timestamp when the session was completed. */
  completedAt: string;
  /** Local calendar date "YYYY-MM-DD" (used for streaks). */
  date: string;
  /** How many of the 12 stations were finished. */
  stationsCompleted: number;
  /** Whether the whole circuit was finished. */
  finished: boolean;
  /** Actual active duration in seconds. */
  durationSeconds: number;
}

export interface Progress {
  settings: Settings;
  sessions: WorkoutSession[];
}

export const DEFAULT_SETTINGS: Settings = {
  gender: "male",
  reminderTime: "18:00",
  remindersEnabled: false,
  soundEnabled: true,
};

const KEY = "workout:v1:progress";

export interface ProgressStore {
  get(): Promise<Progress>;
  saveSettings(settings: Settings): Promise<void>;
  addSession(session: WorkoutSession): Promise<void>;
}

function read(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { settings: { ...DEFAULT_SETTINGS }, sessions: [] };
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, sessions: [] };
  }
}

function write(progress: Progress): void {
  localStorage.setItem(KEY, JSON.stringify(progress));
}

export const localProgressStore: ProgressStore = {
  async get() {
    return read();
  },
  async saveSettings(settings) {
    const cur = read();
    write({ ...cur, settings });
  },
  async addSession(session) {
    const cur = read();
    // Keep the most recent 365 sessions — plenty for streaks/history.
    const sessions = [session, ...cur.sessions].slice(0, 365);
    write({ ...cur, sessions });
  },
};

// --- Derived helpers -------------------------------------------------------

/** Local "YYYY-MM-DD" for a given date (defaults to now). */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Current streak = number of consecutive days (ending today or yesterday) that
 * have at least one finished session. A gap of more than one day breaks it.
 */
export function currentStreak(sessions: WorkoutSession[]): number {
  const days = new Set(
    sessions.filter((s) => s.finished).map((s) => s.date),
  );
  if (days.size === 0) return 0;

  const today = new Date();
  // Allow the streak to "still count" if the last workout was yesterday.
  let cursor = new Date(today);
  if (!days.has(localDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(localDate(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(localDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function totalFinished(sessions: WorkoutSession[]): number {
  return sessions.filter((s) => s.finished).length;
}
