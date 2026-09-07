import { describe, expect, it } from 'vitest';
import {
  daytimeForecast, isValidPlz, plzQuery, weatherSymbol,
} from '../supabase/functions/family-weather/weather.ts';
import type { WeatherGraph } from '../supabase/functions/family-weather/weather.ts';
import real from './fixtures-weather.json' with { type: 'json' };

/** A graph starting at midnight UTC, one value per hour. */
function graph(hours: Omit<WeatherGraph, 'start'> = {}): WeatherGraph {
  return { start: Date.parse('2026-09-07T00:00:00Z'), ...hours };
}

/** `value` for every hour of two days. */
function flat(value: number, n = 48): number[] {
  return Array.from({ length: n }, () => value);
}

describe('plz', () => {
  it('takes a Swiss postal code and appends what the endpoint wants', () => {
    expect(plzQuery('8134')).toBe('813400');
    expect(plzQuery(' 8001 ')).toBe('800100');
  });

  it('refuses anything that is not one', () => {
    for (const bad of ['', '80', '80011', '0800', 'abcd', '8a34']) {
      expect(isValidPlz(bad)).toBe(false);
      expect(plzQuery(bad)).toBeNull();
    }
  });
});

describe('daytimeForecast', () => {
  it('reads only the hours inside the window', () => {
    // 0 degrees all night, 20 during the day: taking the whole day would
    // report a minimum of 0, which is the very thing this avoids.
    const temps = Array.from({ length: 48 }, (_, i) => (i % 24 >= 8 && i % 24 < 18 ? 20 : 0));
    const days = daytimeForecast(
      graph({ temperatureMin1h: temps, temperatureMax1h: temps }), 'UTC');
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ date: '2026-09-07', tempMin: 20, tempMax: 20, hours: 10 });
  });

  it('adds the rain up over the window and leaves the night out', () => {
    const rain = Array.from({ length: 24 }, (_, i) => (i >= 8 && i < 18 ? 0.5 : 9));
    const days = daytimeForecast(
      graph({ temperatureMin1h: flat(10, 24), temperatureMax1h: flat(12, 24), precipitation1h: rain }),
      'UTC');
    expect(days[0].precipitation).toBe(5);
  });

  it('reads the window in the family zone, not in UTC', () => {
    // 06:00 UTC is 08:00 in Zurich in September, so Zurich sees one more early
    // hour of this day than UTC does.
    const temps = Array.from({ length: 48 }, (_, i) => i);
    const utc = daytimeForecast(graph({ temperatureMin1h: temps, temperatureMax1h: temps }), 'UTC');
    const zrh = daytimeForecast(
      graph({ temperatureMin1h: temps, temperatureMax1h: temps }), 'Europe/Zurich');
    expect(utc[0].tempMin).toBe(8);
    expect(zrh[0].tempMin).toBe(6);
  });

  it('honours a different window', () => {
    const temps = Array.from({ length: 24 }, (_, i) => i);
    const days = daytimeForecast(
      graph({ temperatureMin1h: temps, temperatureMax1h: temps }), 'UTC', 12, 14);
    expect(days[0]).toMatchObject({ tempMin: 12, tempMax: 13, hours: 2 });
  });

  it('keeps a day the forecast only half covers', () => {
    // Today is usually part gone when this runs.
    const late = { ...graph(), start: Date.parse('2026-09-07T15:00:00Z') };
    const days = daytimeForecast(
      { ...late, temperatureMin1h: flat(14, 6), temperatureMax1h: flat(16, 6) }, 'UTC');
    expect(days[0]).toMatchObject({ date: '2026-09-07', hours: 3 });
  });

  it('survives the short and missing arrays the endpoint sends', () => {
    // precipitation1h is genuinely shorter than the temperature series.
    const days = daytimeForecast(
      graph({ temperatureMin1h: flat(10, 24), temperatureMax1h: flat(12, 24), precipitation1h: [0.4] }),
      'UTC');
    expect(days[0].precipitation).toBe(0);
    expect(days[0].sunshine).toBe(0);
    expect(daytimeForecast(graph(), 'UTC')).toEqual([]);
    expect(daytimeForecast({}, 'UTC')).toEqual([]);
  });

  it('reads a real MeteoSwiss response', () => {
    // Captured from plzDetail for 8001 — the shape this has to survive.
    const days = daytimeForecast(real as WeatherGraph, 'Europe/Zurich');
    expect(days.length).toBeGreaterThanOrEqual(2);
    const monday = days.find(d => d.date === '2026-09-07')!;
    expect(monday.hours).toBe(10);
    expect(monday).toMatchObject({ tempMin: 18, tempMax: 31, precipitation: 0 });
    // Hazy that Monday, clear the day after — and the symbol follows.
    expect(monday.sunshine).toBeCloseTo(0.44, 2);
    expect(weatherSymbol(monday)).toBe('partly');

    const tuesday = days.find(d => d.date === '2026-09-08')!;
    expect(tuesday).toMatchObject({ tempMin: 18, tempMax: 33 });
    expect(weatherSymbol(tuesday)).toBe('sunny');

    // MeteoSwiss's own daily figures for that Monday are 18/30 — ours read the
    // daytime hours only, so they sit close but not equal.
    expect(monday.tempMax).toBeGreaterThanOrEqual(30);
  });
});

describe('weatherSymbol', () => {
  const day = (over: Partial<{ tempMax: number; precipitation: number; sunshine: number }>) =>
    ({ tempMax: 15, precipitation: 0, sunshine: 0, ...over });

  it('reads the sky when it stays dry', () => {
    expect(weatherSymbol(day({ sunshine: 0.9 }))).toBe('sunny');
    expect(weatherSymbol(day({ sunshine: 0.6 }))).toBe('sunny');
    expect(weatherSymbol(day({ sunshine: 0.4 }))).toBe('partly');
    expect(weatherSymbol(day({ sunshine: 0.25 }))).toBe('partly');
    expect(weatherSymbol(day({ sunshine: 0.1 }))).toBe('cloudy');
  });

  it('lets rain decide over a bright morning', () => {
    expect(weatherSymbol(day({ precipitation: 4, sunshine: 0.9 }))).toBe('showers');
    expect(weatherSymbol(day({ precipitation: 4, sunshine: 0.1 }))).toBe('rain');
  });

  it('calls it snow below freezing', () => {
    expect(weatherSymbol(day({ precipitation: 3, tempMax: 1 }))).toBe('snow');
    expect(weatherSymbol(day({ precipitation: 3, tempMax: 5 }))).toBe('rain');
  });

  it('ignores a trace of rain', () => {
    // A tenth of a millimetre over ten hours is not something to dress for.
    expect(weatherSymbol(day({ precipitation: 0.1, sunshine: 0.9 }))).toBe('sunny');
    expect(weatherSymbol(day({ precipitation: 0.2, sunshine: 0.9 }))).toBe('showers');
  });
});
