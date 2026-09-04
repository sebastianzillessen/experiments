import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { burnInOffset, curtainClockSpot, readKioskSettings } from '../lib/kiosk.ts';
import type { KioskSettings } from '../lib/kiosk.ts';

const STORAGE_KEY = 'fp.kiosk';
/** One timer drives everything, so the three jobs cannot drift apart. */
const TICK_MS = 20_000;

// One shared value for the whole app: the switch in the settings and the
// planner behind it must not hold different opinions. Kept as one object so
// useSyncExternalStore sees a stable snapshot.
let cached: KioskSettings | null = null;
const listeners = new Set<() => void>();

function persist(settings: KioskSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not being able to remember is survivable; the URL still works.
  }
}

function currentSettings(): KioskSettings {
  if (!cached) {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private mode or blocked storage: the URL alone decides.
    }
    cached = readKioskSettings(window.location.search, stored);
    persist(cached);
  }
  return cached;
}

/** Switching it on or off takes effect at once — no reload of the app. */
export function setKioskEnabled(enabled: boolean) {
  cached = { ...currentSettings(), enabled };
  persist(cached);
  for (const notify of listeners) notify();
}

export function useKioskSettings(): KioskSettings {
  return useSyncExternalStore(
    notify => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    currentSettings,
  );
}

/**
 * Keeps the iPad awake as long as kiosk mode is on.
 *
 * The lock is dropped by the browser whenever the app is hidden, so it has to
 * be taken again on every return — otherwise the device locks itself an hour
 * later and the plan is gone.
 */
function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let dropped = false;

    const acquire = async () => {
      if (dropped || document.visibilityState !== 'visible') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // Denied, or the tab lost focus mid-request. Next return tries again.
      }
    };

    const onVisibility = () => { if (document.visibilityState === 'visible') void acquire(); };
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      dropped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}

// iOS paints the status bar of a home screen app from <meta theme-color>, and
// it does not care what the page below it looks like. Left alone it stays the
// app's green — a green bar above a dark plan, and above the black curtain a
// green bar is the only thing lit on the whole screen.
let originalTheme: string | null = null;

function setThemeColor(color: string | null) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  if (originalTheme === null) originalTheme = meta.getAttribute('content') ?? '';
  meta.setAttribute('content', color ?? originalTheme);
}

/**
 * The plan's own paper colour, read from the stylesheet rather than repeated
 * here: `body.kiosk` already defines it, and two copies would drift apart.
 */
function kioskPaper(): string {
  const value = getComputedStyle(document.body).getPropertyValue('--paper').trim();
  return value || '#14161a';
}

export type Kiosk = {
  enabled: boolean;
  asleep: boolean;
  wake: () => void;
};

/**
 * @param refresh  pull the calendars again
 * @param rest     put the view back the way someone walking up should find it
 */
export function useKiosk(refresh: () => void, rest: () => void): Kiosk {
  const settings = useKioskSettings();
  const [asleep, setAsleep] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const lastTouch = useRef(Date.now());
  const lastRefresh = useRef(Date.now());
  // Read inside the ticker without restarting it on every render.
  const refreshRef = useRef(refresh);
  const restRef = useRef(rest);
  refreshRef.current = refresh;
  restRef.current = rest;

  useWakeLock(settings.enabled);

  useEffect(() => {
    if (!settings.enabled) return;
    document.body.classList.add('kiosk');
    return () => document.body.classList.remove('kiosk');
  }, [settings.enabled]);

  // The nudge is padding on the body rather than a transform on the plan: a
  // transformed element becomes the frame of reference for every position:
  // fixed child, which would move the sheets and the add button off screen.
  // Opposite sides add up to the same total, so nothing starts scrolling.
  useEffect(() => {
    if (!settings.enabled) return;
    const style = document.body.style;
    style.padding = `${3 + offset.y}px ${3 - offset.x}px ${3 - offset.y}px ${3 + offset.x}px`;
    return () => { style.padding = ''; };
  }, [settings.enabled, offset.x, offset.y]);

  useEffect(() => {
    if (!settings.enabled) return;
    const seen = () => { lastTouch.current = Date.now(); };
    const types = ['pointerdown', 'keydown', 'touchstart'] as const;
    for (const type of types) window.addEventListener(type, seen, { passive: true });
    return () => { for (const type of types) window.removeEventListener(type, seen); };
  }, [settings.enabled]);

  useEffect(() => {
    if (!settings.enabled) return;

    // Everything is decided from elapsed time rather than from how often this
    // fired: an iPad that slept through the night must not owe us 40 syncs.
    const check = () => {
      const now = Date.now();
      setOffset(burnInOffset(Math.floor(now / 60_000)));

      if (now - lastRefresh.current >= settings.refreshMs) {
        lastRefresh.current = now;
        refreshRef.current();
      }
      if (now - lastTouch.current >= settings.idleMs) {
        // Tidy up before going dark, so what appears on a touch is today's
        // plan and not wherever someone left off paging around.
        setAsleep(was => { if (!was) restRef.current(); return true; });
      }
    };

    const id = window.setInterval(check, TICK_MS);
    const onVisibility = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisibility);
    check();

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [settings.enabled, settings.idleMs, settings.refreshMs]);

  // After the class effect above, so --paper is already the kiosk one.
  useEffect(() => {
    if (!settings.enabled) return;
    setThemeColor(asleep ? '#000000' : kioskPaper());
    return () => setThemeColor(null);
  }, [settings.enabled, asleep]);

  const wake = useCallback(() => {
    lastTouch.current = Date.now();
    setAsleep(false);
  }, []);

  // Turning the mode off while the curtain is up must lift it too.
  return { enabled: settings.enabled, asleep: settings.enabled && asleep, wake };
}

/**
 * The black screen. Not the iPad's own — a web app cannot switch the display
 * off, let alone back on. So the screen stays lit and we cover it, which on an
 * LCD is about the backlight and on an OLED is genuinely dark.
 */
export function KioskCurtain({ onWake }: { onWake: () => void }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  const spot = curtainClockSpot(Math.floor(now.getTime() / (5 * 60_000)));
  const clock = now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });

  // Straight onto the body: inside the plan it would sit in whatever frame of
  // reference an ancestor happens to set up.
  return createPortal(
    <button
      type="button"
      className="kiosk-curtain"
      aria-label="Plan anzeigen"
      onClick={onWake}
    >
      <span className="kiosk-clock" style={{ top: `${spot.top}%`, left: `${spot.left}%` }}>
        {clock}
      </span>
    </button>,
    document.body,
  );
}
