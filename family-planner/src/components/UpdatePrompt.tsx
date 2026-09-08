import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

// Home-screen installs otherwise sit on a stale build forever. The service
// worker is registered in "prompt" mode, so a new deploy shows this banner
// instead of swapping the app under the user's fingers.
//
// Registering is not enough on its own: the browser looks for a new worker
// when the page is opened and then roughly once a day, so the iPad on the
// wall — which is never reloaded — would never hear about a deploy. It asks
// on a timer instead.
const CHECK_EVERY_MS = 15 * 60_000;

export function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    updateRef.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setNeedRefresh(true),
      onRegisteredSW: (swUrl, registration) => {
        if (!registration) return;
        const check = async () => {
          // No point asking from a background tab or with no network.
          if (document.visibilityState !== 'visible' || !navigator.onLine) return;
          try {
            // Ask the network first. Mid-deploy the worker can be missing for
            // a moment, and update() on a bad response only logs noise.
            const res = await fetch(swUrl, { cache: 'no-store' });
            if (res.ok) await registration.update();
          } catch {
            // Offline, or the deploy is in flight. The next tick tries again.
          }
        };
        const timer = window.setInterval(check, CHECK_EVERY_MS);
        // Coming back to the tab is the other moment worth asking.
        document.addEventListener('visibilitychange', check);
        stopRef.current = () => {
          window.clearInterval(timer);
          document.removeEventListener('visibilitychange', check);
        };
      },
    });
    return () => { stopRef.current?.(); stopRef.current = null; };
  }, []);

  if (!needRefresh) return null;
  return (
    <div className="toast update-prompt" role="status">
      <span className="grow">Neue Version verfügbar.</span>
      <button onClick={() => updateRef.current?.(true)}>Aktualisieren</button>
      <button onClick={() => setNeedRefresh(false)}>Später</button>
    </div>
  );
}
