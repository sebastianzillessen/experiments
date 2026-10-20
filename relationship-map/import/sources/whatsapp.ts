import { openReadonly } from "../db.ts";
import type { InteractionEvent } from "../types.ts";

/** 1:1 chats only — JIDs ending in @s.whatsapp.net (groups are @g.us). */
const ONE_TO_ONE = "%@s.whatsapp.net";

function jidToPhone(jid: string): string {
  return jid.split("@")[0]!;
}

/** All 1:1 WhatsApp interactions, one event per message. */
export function readWhatsappEvents(dbPath: string): InteractionEvent[] {
  const db = openReadonly(dbPath);
  try {
    const rows = db
      .prepare(
        `SELECT chat_jid AS jid, timestamp AS ts, is_from_me AS fromMe
         FROM messages
         WHERE chat_jid LIKE ?`,
      )
      .all(ONE_TO_ONE) as Array<{ jid: string; ts: string; fromMe: number }>;
    return rows
      .map((r) => ({
        channel: "whatsapp" as const,
        handle: jidToPhone(r.jid),
        // Stored as "2026-06-19 22:50:10+02:00" — make it ISO before parsing.
        tsMs: Date.parse(r.ts.replace(" ", "T")),
        outgoing: r.fromMe === 1,
      }))
      .filter((e) => Number.isFinite(e.tsMs));
  } finally {
    db.close();
  }
}

/** Display names for 1:1 chats, keyed by phone (jid prefix). */
export function readWhatsappNames(dbPath: string): Map<string, string> {
  const db = openReadonly(dbPath);
  try {
    const rows = db
      .prepare(`SELECT jid, name FROM chats WHERE jid LIKE ? AND name IS NOT NULL AND name <> ''`)
      .all(ONE_TO_ONE) as Array<{ jid: string; name: string }>;
    return new Map(rows.map((r) => [jidToPhone(r.jid), r.name]));
  } finally {
    db.close();
  }
}
