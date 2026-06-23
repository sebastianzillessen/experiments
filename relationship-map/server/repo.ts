import { db } from "./db.ts";
import type {
  Category,
  ContactFrequency,
  MapPerson,
  Person,
  RatingLogEntry,
  Settings,
  TimelineResponse,
} from "./types.ts";

interface PersonRow {
  id: number;
  name: string;
  category_id: number;
  contact_frequency: ContactFrequency;
  current_rating: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

function rowToPerson(row: PersonRow): Person {
  return { ...row, archived: row.archived === 1 };
}

const now = () => new Date().toISOString();

// ---- Settings ---------------------------------------------------------------

export function getSettings(): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setSettings(updates: Settings): Settings {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  const tx = db.transaction((entries: Array<[string, string]>) => {
    for (const [k, v] of entries) stmt.run(k, v);
  });
  tx(Object.entries(updates));
  return getSettings();
}

// ---- Categories -------------------------------------------------------------

export function listCategories(): Category[] {
  return db
    .prepare("SELECT * FROM categories ORDER BY sort_order, id")
    .all() as Category[];
}

export function createCategory(name: string, color: string): Category {
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories")
    .get() as { m: number };
  const info = db
    .prepare("INSERT INTO categories (name, color, sort_order) VALUES (?, ?, ?)")
    .run(name, color, maxOrder.m + 1);
  return db
    .prepare("SELECT * FROM categories WHERE id = ?")
    .get(info.lastInsertRowid) as Category;
}

export function updateCategory(
  id: number,
  fields: Partial<Pick<Category, "name" | "color" | "sort_order">>,
): Category | undefined {
  const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as
    | Category
    | undefined;
  if (!existing) return undefined;
  const merged = { ...existing, ...fields };
  db.prepare(
    "UPDATE categories SET name = ?, color = ?, sort_order = ? WHERE id = ?",
  ).run(merged.name, merged.color, merged.sort_order, id);
  return db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as Category;
}

export function categoryInUse(id: number): boolean {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM people WHERE category_id = ?")
    .get(id) as { n: number };
  return row.n > 0;
}

export function deleteCategory(id: number): void {
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}

// ---- People -----------------------------------------------------------------

export function listPeople(includeArchived = false): Person[] {
  const sql =
    "SELECT * FROM people" +
    (includeArchived ? "" : " WHERE archived = 0") +
    " ORDER BY id";
  return (db.prepare(sql).all() as PersonRow[]).map(rowToPerson);
}

export function getPerson(id: number): Person | undefined {
  const row = db.prepare("SELECT * FROM people WHERE id = ?").get(id) as
    | PersonRow
    | undefined;
  return row ? rowToPerson(row) : undefined;
}

export function createPerson(input: {
  name: string;
  category_id: number;
  contact_frequency: ContactFrequency;
  rating: number;
}): Person {
  const ts = now();
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        "INSERT INTO people (name, category_id, contact_frequency, current_rating, archived, created_at, updated_at) " +
          "VALUES (?, ?, ?, ?, 0, ?, ?)",
      )
      .run(input.name, input.category_id, input.contact_frequency, input.rating, ts, ts);
    const personId = Number(info.lastInsertRowid);
    // Seed log entry so the log alone can reconstruct any historical rating.
    db.prepare(
      "INSERT INTO rating_log (person_id, old_rating, new_rating, changed_at, note) " +
        "VALUES (?, NULL, ?, ?, NULL)",
    ).run(personId, input.rating, ts);
    return personId;
  });
  const id = tx();
  return getPerson(id)!;
}

export function updatePerson(
  id: number,
  fields: Partial<
    Pick<Person, "name" | "category_id" | "contact_frequency" | "archived">
  >,
): Person | undefined {
  const existing = getPerson(id);
  if (!existing) return undefined;
  const merged = { ...existing, ...fields };
  db.prepare(
    "UPDATE people SET name = ?, category_id = ?, contact_frequency = ?, archived = ?, updated_at = ? WHERE id = ?",
  ).run(
    merged.name,
    merged.category_id,
    merged.contact_frequency,
    merged.archived ? 1 : 0,
    now(),
    id,
  );
  return getPerson(id);
}

/** Atomically append to the change log and refresh the cached current_rating. */
export function changeRating(
  id: number,
  newRating: number,
  note: string | null,
): Person | undefined {
  const existing = getPerson(id);
  if (!existing) return undefined;
  const ts = now();
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO rating_log (person_id, old_rating, new_rating, changed_at, note) VALUES (?, ?, ?, ?, ?)",
    ).run(id, existing.current_rating, newRating, ts, note);
    db.prepare(
      "UPDATE people SET current_rating = ?, updated_at = ? WHERE id = ?",
    ).run(newRating, ts, id);
  });
  tx();
  return getPerson(id);
}

// ---- Import -----------------------------------------------------------------

export interface ImportedPersonInput {
  external_key: string;
  name: string;
  category_id: number;
  contact_frequency: ContactFrequency;
  /** Backfilled rating history, ascending by changed_at. Empty = no interaction. */
  history: Array<{ changed_at: string; rating: number }>;
  archived: boolean;
}

export interface ImportPersonResult {
  created: boolean;
}

/** Find or create a category by name, returning its id. */
export function ensureCategory(name: string, color: string): number {
  const existing = db
    .prepare("SELECT id FROM categories WHERE name = ?")
    .get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  return createCategory(name, color).id;
}

function getPersonByExternalKey(externalKey: string): PersonRow | undefined {
  return db.prepare("SELECT * FROM people WHERE external_key = ?").get(externalKey) as
    | PersonRow
    | undefined;
}

function latestRating(personId: number): number | undefined {
  const row = db
    .prepare(
      "SELECT new_rating FROM rating_log WHERE person_id = ? ORDER BY changed_at DESC, id DESC LIMIT 1",
    )
    .get(personId) as { new_rating: number } | undefined;
  return row?.new_rating;
}

/**
 * Insert or update an imported person, keyed by external_key. Backfilled history
 * is written with source='import'; on re-import only those rows are replaced, so
 * manual drag edits (source='manual') survive. The cached current_rating is
 * recomputed from the latest entry in the *full* log.
 */
export function upsertImportedPerson(input: ImportedPersonInput): ImportPersonResult {
  const ts = now();
  const insertLog = db.prepare(
    "INSERT INTO rating_log (person_id, old_rating, new_rating, changed_at, note, source) " +
      "VALUES (?, ?, ?, ?, NULL, 'import')",
  );
  const writeHistory = (personId: number) => {
    let prev: number | null = null;
    for (const h of input.history) {
      insertLog.run(personId, prev, h.rating, h.changed_at);
      prev = h.rating;
    }
  };

  const existing = getPersonByExternalKey(input.external_key);

  const tx = db.transaction((): boolean => {
    if (existing) {
      db.prepare("DELETE FROM rating_log WHERE person_id = ? AND source = 'import'").run(
        existing.id,
      );
      writeHistory(existing.id);
      // Preserve a manually-set category; only refresh name/frequency/archived.
      db.prepare(
        "UPDATE people SET name = ?, contact_frequency = ?, archived = ?, current_rating = ?, updated_at = ? WHERE id = ?",
      ).run(
        input.name,
        input.contact_frequency,
        input.archived ? 1 : 0,
        latestRating(existing.id) ?? existing.current_rating,
        ts,
        existing.id,
      );
      return false;
    }
    const initialRating =
      input.history.length > 0 ? input.history[input.history.length - 1]!.rating : 1;
    const info = db
      .prepare(
        "INSERT INTO people (name, category_id, contact_frequency, current_rating, archived, source, external_key, created_at, updated_at) " +
          "VALUES (?, ?, ?, ?, ?, 'import', ?, ?, ?)",
      )
      .run(
        input.name,
        input.category_id,
        input.contact_frequency,
        initialRating,
        input.archived ? 1 : 0,
        input.external_key,
        ts,
        ts,
      );
    writeHistory(Number(info.lastInsertRowid));
    return true;
  });

  return { created: tx() };
}

export function getHistory(personId: number): RatingLogEntry[] {
  return db
    .prepare(
      "SELECT * FROM rating_log WHERE person_id = ? ORDER BY changed_at, id",
    )
    .all(personId) as RatingLogEntry[];
}

// ---- Map / history reconstruction -------------------------------------------

/** Live map: current ratings of non-archived people. */
export function liveMap(): MapPerson[] {
  return listPeople(false).map((p) => ({
    id: p.id,
    name: p.name,
    category_id: p.category_id,
    contact_frequency: p.contact_frequency,
    rating: p.current_rating,
    archived: p.archived,
  }));
}

/**
 * Reconstruct the map at instant `at`: each person's rating is the latest log
 * entry with changed_at <= at. People without such an entry didn't exist yet
 * and are omitted.
 */
export function mapAt(at: string): MapPerson[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.category_id, p.contact_frequency, p.archived,
              r.new_rating AS rating
       FROM rating_log r
       JOIN people p ON p.id = r.person_id
       WHERE r.changed_at <= ?
         AND r.changed_at = (
           SELECT MAX(r2.changed_at) FROM rating_log r2
           WHERE r2.person_id = r.person_id AND r2.changed_at <= ?
         )
       GROUP BY p.id
       ORDER BY p.id`,
    )
    .all(at, at) as Array<{
    id: number;
    name: string;
    category_id: number;
    contact_frequency: ContactFrequency;
    archived: number;
    rating: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category_id: r.category_id,
    contact_frequency: r.contact_frequency,
    rating: r.rating,
    archived: r.archived === 1,
  }));
}

export function timeline(): TimelineResponse {
  const dates = (
    db
      .prepare(
        "SELECT DISTINCT changed_at FROM rating_log ORDER BY changed_at",
      )
      .all() as Array<{ changed_at: string }>
  ).map((r) => r.changed_at);
  return {
    min: dates[0] ?? null,
    max: dates[dates.length - 1] ?? null,
    dates,
  };
}

// ---- Export -----------------------------------------------------------------

export function exportAll() {
  return {
    settings: getSettings(),
    categories: listCategories(),
    people: listPeople(true),
    rating_log: db
      .prepare("SELECT * FROM rating_log ORDER BY id")
      .all() as RatingLogEntry[],
    exported_at: now(),
  };
}
