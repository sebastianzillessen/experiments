import type { Database } from "better-sqlite3";

const DEFAULT_CATEGORIES: Array<{ name: string; color: string }> = [
  { name: "Partner", color: "#e11d48" },
  { name: "Family", color: "#f59e0b" },
  { name: "Friends", color: "#10b981" },
  { name: "Work", color: "#3b82f6" },
  { name: "Other", color: "#8b5cf6" },
];

export function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      color      TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS people (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL,
      category_id       INTEGER NOT NULL REFERENCES categories(id),
      contact_frequency TEXT NOT NULL,
      current_rating    INTEGER NOT NULL CHECK (current_rating BETWEEN 1 AND 10),
      archived          INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_people_category ON people(category_id);

    CREATE TABLE IF NOT EXISTS rating_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id  INTEGER NOT NULL REFERENCES people(id),
      old_rating INTEGER,
      new_rating INTEGER NOT NULL CHECK (new_rating BETWEEN 1 AND 10),
      changed_at TEXT NOT NULL,
      note       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ratinglog_person_time
      ON rating_log(person_id, changed_at);
    CREATE INDEX IF NOT EXISTS idx_ratinglog_time ON rating_log(changed_at);
  `);

  seed(db);
}

function seed(db: Database): void {
  const seedSetting = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  );
  seedSetting.run("self_name", "Me");

  const categoryCount = db
    .prepare("SELECT COUNT(*) AS n FROM categories")
    .get() as { n: number };
  if (categoryCount.n === 0) {
    const insert = db.prepare(
      "INSERT INTO categories (name, color, sort_order) VALUES (?, ?, ?)",
    );
    DEFAULT_CATEGORIES.forEach((c, i) => insert.run(c.name, c.color, i));
  }
}
