import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();

/** Filesystem locations of the local data sources (override via env for tests). */
export const SOURCES = {
  contactsDir:
    process.env.IMPORT_CONTACTS_DIR ??
    join(HOME, "Library", "Application Support", "AddressBook"),
  imessageDb:
    process.env.IMPORT_IMESSAGE_DB ?? join(HOME, "Library", "Messages", "chat.db"),
  whatsappDb:
    process.env.IMPORT_WHATSAPP_DB ??
    join(HOME, "03_Dev", "whatsapp-mcp", "whatsapp-bridge", "store", "messages.db"),
  mailIndex:
    process.env.IMPORT_MAIL_INDEX ??
    join(HOME, "Library", "Mail", "V10", "MailData", "Envelope Index"),
} as const;

/** Half-life (days) for recency weighting: a message's weight halves every N days. */
export const HALF_LIFE_DAYS = Number(process.env.IMPORT_HALF_LIFE_DAYS ?? 180);

/** How many of the strongest relationships are placed on the map; rest archived. */
export const PLACE_LIMIT = Number(process.env.IMPORT_PLACE_LIMIT ?? 50);

/**
 * Minimum messages for an *unknown* (not-in-contacts) handle to be imported at
 * all — filters 2FA codes, delivery bots, and one-off texts. Known contacts are
 * always kept regardless of volume.
 */
export const MIN_UNKNOWN_EVENTS = Number(process.env.IMPORT_MIN_UNKNOWN_EVENTS ?? 5);

/**
 * Addresses that are "me" — excluded from scoring so self-sent mail doesn't
 * inflate a contact. Comma-separated emails/phones via env; merged with the
 * Contacts "me" card and self_name at runtime.
 */
export const SELF_HANDLES: string[] = (process.env.IMPORT_SELF_HANDLES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
