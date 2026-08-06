import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

/**
 * Open a source database read-only. iMessage and Mail keep WAL locks while their
 * apps run, which can make a direct read-only open fail; on any open error we
 * copy the file (plus -wal/-shm sidecars) to a temp dir and open the copy.
 */
export function openReadonly(path: string): Database.Database {
  if (!existsSync(path)) {
    throw new Error(`source database not found: ${path}`);
  }
  try {
    return new Database(path, { readonly: true, fileMustExist: true });
  } catch {
    const dir = mkdtempSync(join(tmpdir(), "relmap-import-"));
    const copy = join(dir, basename(path));
    copyFileSync(path, copy);
    for (const suffix of ["-wal", "-shm"]) {
      if (existsSync(path + suffix)) copyFileSync(path + suffix, copy + suffix);
    }
    return new Database(copy, { readonly: true, fileMustExist: true });
  }
}
