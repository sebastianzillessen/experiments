import { useEffect, useRef, useState } from 'react';

// Notify a long-lived (home-screen) app that a newer build has been deployed and
// let the user refresh on their terms — the app has no service worker, so a
// permanently open PWA would otherwise stay on a stale bundle indefinitely.
//
// build.sh stamps window.__APP_VERSION.commit into config.js on every deploy. We
// periodically re-fetch config.js (cache-busted, no-store) and compare the
// deployed commit to the one this session booted with; a difference means a new
// version is live.

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly while the app stays open

function parseCommit(text: string): string | null {
  const m = text.match(/__APP_VERSION\s*=\s*\{[^}]*commit\s*:\s*["']([^"']+)["']/);
  return m ? m[1] : null;
}

export function UpdatePrompt() {
  const runningCommit = window.__APP_VERSION?.commit ?? null;
  const [newCommit, setNewCommit] = useState<string | null>(null);
  const dismissedRef = useRef<string | null>(null);

  useEffect(() => {
    // Without a build stamp (local dev without config.js) there is nothing to
    // compare against, so the prompt simply never appears.
    if (!runningCommit) return;
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`config.js?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const commit = parseCommit(await res.text());
        if (!commit || cancelled) return;
        // Show the banner for a genuinely newer commit the user has not already
        // dismissed; otherwise keep it hidden.
        setNewCommit(commit !== runningCommit && commit !== dismissedRef.current ? commit : null);
      } catch {
        /* offline / transient — try again on the next tick or focus */
      }
    }

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    check(); // also right now: a resumed home-screen app may already be stale

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, [runningCommit]);

  if (!newCommit) return null;

  return (
    <div id="update-banner" className="update-banner no-print" role="alert">
      <div className="text">Neue Version verfügbar.</div>
      <button type="button" id="btn-update-later" className="update-later"
        onClick={() => { dismissedRef.current = newCommit; setNewCommit(null); }}>
        Später
      </button>
      <button type="button" id="btn-update-now" className="btn btn-small"
        onClick={() => window.location.reload()}>
        Aktualisieren
      </button>
    </div>
  );
}
