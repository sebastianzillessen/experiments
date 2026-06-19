import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "./migrations.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolve the DB path: env override (used by tests) or the default data file. */
function resolveDbPath(): string {
  if (process.env.DB_PATH) return resolve(process.env.DB_PATH);
  return resolve(__dirname, "..", "data", "relationship-map.db");
}

const dbPath = resolveDbPath();
mkdirSync(dirname(dbPath), { recursive: true });

export const db: Database.Database = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

migrate(db);
