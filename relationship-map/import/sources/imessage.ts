import { openReadonly } from "../db.ts";
import type { InteractionEvent } from "../types.ts";

const APPLE_EPOCH_MS = 978_307_200_000; // 2001-01-01 UTC in unix ms

/** Apple stores `date` as ns-since-2001 on modern DBs, seconds on very old ones. */
function appleDateToMs(date: number): number {
  return date > 1e12 ? Math.round(date / 1e6) + APPLE_EPOCH_MS : date * 1000 + APPLE_EPOCH_MS;
}

/** All 1:1 iMessage/SMS interactions, one event per message. */
export function readImessageEvents(dbPath: string): InteractionEvent[] {
  const db = openReadonly(dbPath);
  try {
    const rows = db
      .prepare(
        `SELECT h.id AS handle, m.date AS date, m.is_from_me AS fromMe
         FROM message m
         JOIN handle h ON m.handle_id = h.ROWID
         WHERE m.date IS NOT NULL AND h.id IS NOT NULL AND h.id <> ''`,
      )
      .all() as Array<{ handle: string; date: number; fromMe: number }>;
    return rows.map((r) => ({
      channel: "imessage" as const,
      handle: r.handle,
      tsMs: appleDateToMs(r.date),
      outgoing: r.fromMe === 1,
    }));
  } finally {
    db.close();
  }
}
