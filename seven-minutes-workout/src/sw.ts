/// <reference lib="webworker" />
// Custom service worker (injectManifest). Handles precaching for offline use
// plus the push + notificationclick events for reminder notifications.
//
// Type-checked separately from the app (excluded in tsconfig.app.json) because
// the WebWorker lib conflicts with the DOM lib. vite-plugin-pwa compiles this
// file with esbuild.

import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const APP_URL = "/seven-minutes-workout/";

precacheAndRoute(self.__WB_MANIFEST);

// SPA: serve the cached index.html for navigations so the app works offline.
// API calls are excluded so they always hit the network/Worker.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(`${APP_URL}index.html`), {
    denylist: [/^\/api\//],
  }),
);

// Activate the new SW immediately when the user accepts the update prompt.
self.addEventListener("message", (event) => {
  if ((event as ExtendableMessageEvent).data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

// Payload-less reminder push: the Worker cron sends an empty push, we render a
// fixed reminder. (No data => no decryption needed on either side.)
self.addEventListener("push", (event: PushEvent) => {
  let title = "Zeit für dein 7-Minuten-Workout 💪";
  let body = "Nur 7 Minuten — bleib dran und halte deine Serie am Leben!";
  // If a payload ever is sent, prefer it.
  if (event.data) {
    try {
      const json = event.data.json() as { title?: string; body?: string };
      if (json.title) title = json.title;
      if (json.body) body = json.body;
    } catch {
      /* not JSON — keep defaults */
    }
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: `${APP_URL}pwa-192x192.png`,
      badge: `${APP_URL}pwa-192x192.png`,
      tag: "workout-reminder",
      renotify: true,
      data: { url: APP_URL },
    } as NotificationOptions),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string })?.url ?? APP_URL;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(APP_URL) && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
