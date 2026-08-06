import { useRegisterSW } from "virtual:pwa-register/react";

// Hourly update check so a long-lived home-screen app picks up new builds
// without a cold start.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Shows a small banner when a new service worker is ready. The user decides
 * when to reload (no forced refresh mid-workout). Renders nothing otherwise.
 */
export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {
          /* offline — retry next interval */
        });
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="update-banner" role="alert">
      <span>Neue Version verfügbar.</span>
      <button className="update-banner__dismiss" onClick={() => setNeedRefresh(false)}>
        Später
      </button>
      <button className="update-banner__refresh" onClick={() => void updateServiceWorker(true)}>
        Aktualisieren
      </button>
    </div>
  );
}
