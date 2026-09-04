// Kiosk mode for the iPad on the kitchen wall.
//
// Per device, not per family: only the wall tablet wants a screensaver, so the
// switch comes from the URL the home screen icon points at
// (`…/?kiosk=1`) and is remembered from then on.
//
// This file holds the parts worth testing on their own. The browser side —
// wake lock, idle timer, the black curtain — lives in KioskMode.tsx.

export type KioskSettings = {
  enabled: boolean;
  /** No touch for this long and the screen goes black. */
  idleMs: number;
  /** How often the calendars are pulled again while the plan is on screen. */
  refreshMs: number;
};

const MINUTE = 60_000;

export const KIOSK_DEFAULTS: KioskSettings = {
  enabled: false,
  idleMs: 5 * MINUTE,
  refreshMs: 15 * MINUTE,
};

function clampMinutes(raw: string | null, fallbackMs: number, min: number, max: number): number {
  const minutes = Number(raw);
  if (!Number.isFinite(minutes)) return fallbackMs;
  return Math.min(max, Math.max(min, Math.round(minutes))) * MINUTE;
}

function readFlag(raw: string): boolean {
  return !['0', 'false', 'off', 'no', 'aus'].includes(raw.trim().toLowerCase());
}

/**
 * `?kiosk=1` turns it on, `?kiosk=0` off again, and `?idle=` / `?refresh=`
 * take minutes. Whatever the URL does not say comes from the last visit, so
 * the mode survives a relaunch of the home screen app.
 */
export function readKioskSettings(search: string, stored: string | null): KioskSettings {
  const settings = { ...KIOSK_DEFAULTS };

  if (stored) {
    try {
      const saved = JSON.parse(stored) as Partial<KioskSettings>;
      if (typeof saved.enabled === 'boolean') settings.enabled = saved.enabled;
      if (Number.isFinite(saved.idleMs)) settings.idleMs = saved.idleMs!;
      if (Number.isFinite(saved.refreshMs)) settings.refreshMs = saved.refreshMs!;
    } catch {
      // Nothing readable stored: the defaults above stand.
    }
  }

  const params = new URLSearchParams(search);
  const flag = params.get('kiosk');
  if (flag !== null) settings.enabled = readFlag(flag);
  if (params.has('idle')) settings.idleMs = clampMinutes(params.get('idle'), settings.idleMs, 1, 120);
  if (params.has('refresh')) {
    settings.refreshMs = clampMinutes(params.get('refresh'), settings.refreshMs, 1, 240);
  }
  return settings;
}

// Nine spots around the middle. The whole plan is nudged between them so no
// pixel keeps showing the same table rule for days on end.
const DRIFT = [
  [0, 0], [3, -3], [3, 3], [-3, 3], [-3, -3], [0, -3], [3, 0], [0, 3], [-3, 0],
] as const;

/** How far to nudge the plan. `tick` is meant to be one step per minute. */
export function burnInOffset(tick: number): { x: number; y: number } {
  const size = DRIFT.length;
  const [x, y] = DRIFT[((Math.trunc(tick) % size) + size) % size];
  return { x, y };
}

// Where the clock stands on the black screen, in percent. Same idea, bigger
// steps: on the curtain it is the only thing lit.
const SPOTS = [
  [22, 20], [30, 64], [58, 28], [70, 66], [44, 46], [24, 52], [64, 22], [36, 74],
] as const;

export function curtainClockSpot(tick: number): { top: number; left: number } {
  const size = SPOTS.length;
  const [top, left] = SPOTS[((Math.trunc(tick) % size) + size) % size];
  return { top, left };
}
