import { describe, expect, it } from 'vitest';
import {
  burnInOffset, curtainClockSpot, KIOSK_DEFAULTS, readKioskSettings,
} from '../src/lib/kiosk.ts';

const MINUTE = 60_000;

describe('readKioskSettings', () => {
  it('is off until the URL says otherwise', () => {
    expect(readKioskSettings('', null)).toEqual(KIOSK_DEFAULTS);
  });

  it('turns on with ?kiosk=1 and off again with ?kiosk=0', () => {
    expect(readKioskSettings('?kiosk=1', null).enabled).toBe(true);
    const on = JSON.stringify({ ...KIOSK_DEFAULTS, enabled: true });
    expect(readKioskSettings('?kiosk=0', on).enabled).toBe(false);
  });

  it('stays on after a relaunch without the flag', () => {
    // The home screen icon keeps its query string, but a redirect or a
    // service-worker start_url can drop it. The stored value carries over.
    const stored = JSON.stringify({ ...KIOSK_DEFAULTS, enabled: true });
    expect(readKioskSettings('', stored).enabled).toBe(true);
  });

  it('takes minutes for the two timers', () => {
    const s = readKioskSettings('?kiosk=1&idle=3&refresh=30', null);
    expect(s.idleMs).toBe(3 * MINUTE);
    expect(s.refreshMs).toBe(30 * MINUTE);
  });

  it('clamps nonsense instead of blanking the screen every second', () => {
    expect(readKioskSettings('?idle=0', null).idleMs).toBe(1 * MINUTE);
    expect(readKioskSettings('?idle=9999', null).idleMs).toBe(120 * MINUTE);
    expect(readKioskSettings('?refresh=-5', null).refreshMs).toBe(1 * MINUTE);
    expect(readKioskSettings('?idle=bald', null).idleMs).toBe(KIOSK_DEFAULTS.idleMs);
  });

  it('survives a damaged stored value', () => {
    expect(readKioskSettings('', '{nope')).toEqual(KIOSK_DEFAULTS);
    expect(readKioskSettings('', '{"enabled":"ja"}').enabled).toBe(false);
  });

  it('lets the URL win over what was stored', () => {
    const stored = JSON.stringify({ enabled: true, idleMs: 60 * MINUTE, refreshMs: 60 * MINUTE });
    const s = readKioskSettings('?idle=2', stored);
    expect(s.idleMs).toBe(2 * MINUTE);
    expect(s.refreshMs).toBe(60 * MINUTE);
    expect(s.enabled).toBe(true);
  });
});

describe('burnInOffset', () => {
  it('moves every step and comes back around', () => {
    const seen = new Set<string>();
    for (let tick = 0; tick < 9; tick++) {
      const { x, y } = burnInOffset(tick);
      seen.add(`${x},${y}`);
    }
    expect(seen.size).toBe(9);
    expect(burnInOffset(9)).toEqual(burnInOffset(0));
  });

  it('stays inside the padding the layout reserves', () => {
    for (let tick = 0; tick < 40; tick++) {
      const { x, y } = burnInOffset(tick);
      expect(Math.abs(x)).toBeLessThanOrEqual(3);
      expect(Math.abs(y)).toBeLessThanOrEqual(3);
    }
  });

  it('handles a negative or fractional tick', () => {
    expect(burnInOffset(-1)).toEqual(burnInOffset(8));
    expect(burnInOffset(2.7)).toEqual(burnInOffset(2));
  });
});

describe('curtainClockSpot', () => {
  it('keeps the clock away from the edges', () => {
    for (let tick = 0; tick < 20; tick++) {
      const { top, left } = curtainClockSpot(tick);
      expect(top).toBeGreaterThanOrEqual(15);
      expect(top).toBeLessThanOrEqual(85);
      expect(left).toBeGreaterThanOrEqual(15);
      expect(left).toBeLessThanOrEqual(85);
    }
  });

  it('does not stand still', () => {
    expect(curtainClockSpot(1)).not.toEqual(curtainClockSpot(0));
  });
});
