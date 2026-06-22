// Web Push subscription handling. We use *payload-less* push: the server only
// needs the subscription endpoint (+ when to remind). The service worker
// renders a canned reminder on the `push` event, so we never send p256dh/auth
// keys or an encrypted body.

const API = "/api/workout/subscribe";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready);
}

/**
 * Ask for permission (if needed), subscribe via PushManager, and register the
 * subscription + reminder preferences with the Worker. Returns true on success.
 * Throws with a human-readable message on failure (caller shows it).
 */
export async function enableReminders(reminderTime: string): Promise<boolean> {
  if (!pushSupported()) {
    throw new Error("Push wird auf diesem Gerät/Browser nicht unterstützt.");
  }
  const vapid = window.__APP_CONFIG?.vapidPublicKey;
  if (!vapid) {
    throw new Error(
      "Kein VAPID-Schlüssel konfiguriert (config.js). Erinnerungen sind nur im Deployment verfügbar.",
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Benachrichtigungen wurden nicht erlaubt.");
  }

  const reg = await getRegistration();
  if (!reg) throw new Error("Service Worker nicht bereit.");

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    }));

  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      reminderTime,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  if (!res.ok) {
    throw new Error(`Server hat die Anmeldung abgelehnt (${res.status}).`);
  }
  return true;
}

/** Update the reminder time for an existing subscription (re-POST). */
export async function updateReminderTime(reminderTime: string): Promise<void> {
  const reg = await getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      reminderTime,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
}

/** Unsubscribe locally and tell the Worker to drop the record. */
export async function disableReminders(): Promise<void> {
  const reg = await getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await fetch(API, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
