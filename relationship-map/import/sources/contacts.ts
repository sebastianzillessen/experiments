import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { openReadonly } from "../db.ts";
import { normalizeEmail, normalizePhone } from "../normalize.ts";
import type { RawContact } from "../types.ts";

/** Every AddressBook DB: the top-level one plus each account under Sources/. */
function addressBookDbs(contactsDir: string): string[] {
  const dbs: string[] = [];
  const top = join(contactsDir, "AddressBook-v22.abcddb");
  if (existsSync(top)) dbs.push(top);
  const sourcesDir = join(contactsDir, "Sources");
  if (existsSync(sourcesDir)) {
    for (const entry of readdirSync(sourcesDir)) {
      const candidate = join(sourcesDir, entry, "AddressBook-v22.abcddb");
      if (existsSync(candidate)) dbs.push(candidate);
    }
  }
  return dbs;
}

function displayName(r: {
  first: string | null;
  last: string | null;
  org: string | null;
  nick: string | null;
}): string {
  const full = [r.first, r.last].filter(Boolean).join(" ").trim();
  return full || r.nick?.trim() || r.org?.trim() || "";
}

/** Read all macOS contacts, merged across address-book sources. */
export function readContacts(contactsDir: string): RawContact[] {
  const out: RawContact[] = [];
  for (const dbPath of addressBookDbs(contactsDir)) {
    // Source uuid keeps contactKeys unique across accounts.
    const sourceId = basename(dirname(dbPath));
    const db = openReadonly(dbPath);
    try {
      const records = db
        .prepare(
          `SELECT Z_PK AS pk, ZFIRSTNAME AS first, ZLASTNAME AS last,
                  ZORGANIZATION AS org, ZNICKNAME AS nick,
                  ZCONTAINERWHERECONTACTISME AS me
           FROM ZABCDRECORD
           WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL OR ZORGANIZATION IS NOT NULL`,
        )
        .all() as Array<{
        pk: number;
        first: string | null;
        last: string | null;
        org: string | null;
        nick: string | null;
        me: number | null;
      }>;

      const phonesByOwner = groupByOwner(
        db.prepare(`SELECT ZOWNER AS owner, ZFULLNUMBER AS value FROM ZABCDPHONENUMBER`).all() as Array<{
          owner: number;
          value: string | null;
        }>,
        normalizePhone,
      );
      const emailsByOwner = groupByOwner(
        db.prepare(`SELECT ZOWNER AS owner, ZADDRESS AS value FROM ZABCDEMAILADDRESS`).all() as Array<{
          owner: number;
          value: string | null;
        }>,
        normalizeEmail,
      );

      for (const rec of records) {
        const name = displayName(rec);
        if (!name) continue;
        out.push({
          contactKey: `${sourceId}:${rec.pk}`,
          displayName: name,
          phones: phonesByOwner.get(rec.pk) ?? [],
          emails: emailsByOwner.get(rec.pk) ?? [],
          isMe: rec.me != null,
        });
      }
    } finally {
      db.close();
    }
  }
  return out;
}

function groupByOwner(
  rows: Array<{ owner: number; value: string | null }>,
  normalize: (v: string) => string | null,
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const row of rows) {
    if (row.owner == null || !row.value) continue;
    const value = normalize(row.value);
    if (!value) continue;
    const list = map.get(row.owner) ?? [];
    if (!list.includes(value)) list.push(value);
    map.set(row.owner, list);
  }
  return map;
}
