import type { Trip } from "./types";

/**
 * Client-seitige Trip-Erinnerungen.
 *
 * HINWEIS: Das ist bewusst client-seitig — die Erinnerung wird ausgelöst,
 * wenn die App geöffnet/wieder geöffnet wird und der Reisebeginn im
 * eingestellten Fenster liegt. Echtes Background-Push (Benachrichtigung bei
 * komplett geschlossener App) braucht einen Server: Push-Subscription mit
 * VAPID-Keys + einen Sender (der vorhandene Cloudflare-Worker könnte das per
 * Cron übernehmen). Das ist hier noch nicht verdrahtet.
 */

const SHOWN_PREFIX = "packliste:reminder-shown:";

export type PermState = NotificationPermission | "unsupported";

export function notificationPermission(): PermState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Ganztägige Differenz (Zieltag − heute), negativ wenn in der Vergangenheit. */
export function daysUntil(startDate: string, now: Date = new Date()): number {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return NaN;
  const a = Date.parse(now.toISOString().slice(0, 10));
  const b = Date.parse(start.toISOString().slice(0, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Erinnerung fällig? (aktiv, Startdatum, nicht archiviert, im Fenster). */
export function isReminderDue(trip: Trip, now: Date = new Date()): boolean {
  if (!trip.reminderDaysBefore || !trip.startDate || trip.archivedAt) return false;
  const d = daysUntil(trip.startDate, now);
  return !Number.isNaN(d) && d >= 0 && d <= trip.reminderDaysBefore;
}

// Pro (Trip, Startdatum) nur einmal erinnern; verschiebt sich das Datum,
// wird neu erinnert.
function shownKey(trip: Trip): string {
  return `${SHOWN_PREFIX}${trip.id}:${trip.startDate ?? ""}`;
}
export function reminderShown(trip: Trip): boolean {
  try {
    return localStorage.getItem(shownKey(trip)) === "1";
  } catch {
    return false;
  }
}
export function markReminderShown(trip: Trip): void {
  try {
    localStorage.setItem(shownKey(trip), "1");
  } catch {
    /* ignore */
  }
}

/** Baut den Erinnerungstext. */
export function reminderMessage(trip: Trip, now: Date = new Date()): string {
  const d = daysUntil(trip.startDate!, now);
  if (d <= 0) return `„${trip.name}" geht heute los! Packliste checken.`;
  return `„${trip.name}" in ${d} Tag${d === 1 ? "" : "en"} — Packliste checken.`;
}

/** Zeigt eine Browser-Notification (falls erlaubt). Liefert den Text. */
export function fireReminder(trip: Trip, now: Date = new Date()): string {
  const body = reminderMessage(trip, now);
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification("Packliste-Erinnerung", { body, tag: `trip-${trip.id}` });
    } catch {
      /* ignore (z.B. iOS ohne Notification-Konstruktor) */
    }
  }
  return body;
}
