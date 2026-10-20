import { openReadonly } from "../db.ts";
import type { InteractionEvent } from "../types.ts";

/**
 * Email interactions from Apple Mail's Envelope Index. We emit one event per
 * (message, address): the sender (incoming) and each recipient (outgoing). Self
 * addresses are filtered later in scoring, and an email only counts toward a
 * person who already resolves to a contact or another channel — so newsletters
 * and notification senders never become people on their own.
 */
export function readMailEvents(indexPath: string): InteractionEvent[] {
  const db = openReadonly(indexPath);
  try {
    const senders = db
      .prepare(
        `SELECT a.address AS address, m.date_sent AS ts
         FROM messages m JOIN addresses a ON m.sender = a.ROWID
         WHERE a.address IS NOT NULL AND m.date_sent IS NOT NULL`,
      )
      .all() as Array<{ address: string; ts: number }>;
    const recipients = db
      .prepare(
        `SELECT a.address AS address, m.date_sent AS ts
         FROM recipients r
         JOIN addresses a ON r.address = a.ROWID
         JOIN messages m ON r.message = m.ROWID
         WHERE a.address IS NOT NULL AND m.date_sent IS NOT NULL`,
      )
      .all() as Array<{ address: string; ts: number }>;

    const toEvent = (outgoing: boolean) => (r: { address: string; ts: number }) => ({
      channel: "mail" as const,
      handle: r.address,
      tsMs: r.ts * 1000, // Mail stores unix seconds
      outgoing,
    });

    return [...senders.map(toEvent(false)), ...recipients.map(toEvent(true))];
  } finally {
    db.close();
  }
}
