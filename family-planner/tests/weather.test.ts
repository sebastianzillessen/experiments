import { describe, expect, it } from 'vitest';
import {
  daytimeForecast, isValidPlz, plzQuery, weatherSymbol,
} from '../supabase/functions/family-weather/weather.ts';
import type { WeatherPayload } from '../supabase/functions/family-weather/weather.ts';
import real from './fixtures-weather.json' with { type: 'json' };

/** A payload whose hourly series starts at midnight UTC. */
function payload(over: Partial<WeatherPayload['graph']> = {}, forecast: WeatherPayload['forecast'] = []): WeatherPayload {
  return { graph: { start: Date.parse('2026-09-07T00:00:00Z'), ...over }, forecast };
}

/** `value` for every hour. */
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
    const days = daytimeForecast(payload({ temperatureMean1h: temps }), 'UTC');
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ date: '2026-09-07', tempMin: 20, tempMax: 20, hours: 10 });
  });

  it('reads the window in the family zone, not in UTC', () => {
    // 06:00 UTC is 08:00 in Zurich in September, so Zurich sees one more early
    // hour of this day than UTC does.
    const temps = Array.from({ length: 48 }, (_, i) => i);
    expect(daytimeForecast(payload({ temperatureMean1h: temps }), 'UTC')[0].tempMin).toBe(8);
    expect(daytimeForecast(payload({ temperatureMean1h: temps }), 'Europe/Zurich')[0].tempMin)
      .toBe(6);
  });

  it('honours a different window', () => {
    const temps = Array.from({ length: 24 }, (_, i) => i);
    const days = daytimeForecast(payload({ temperatureMean1h: temps }), 'UTC', 12, 14);
    expect(days[0]).toMatchObject({ tempMin: 12, tempMax: 13, hours: 2 });
  });

  it('takes the rain from the daily forecast, not the hourly series', () => {
    // The hourly series does not reconcile with the figure MeteoSwiss
    // publishes for the same day, so the published one is what is shown.
    const days = daytimeForecast(
      payload({ temperatureMean1h: flat(12, 24) }, [{ dayDate: '2026-09-07', precipitation: 8.8 }]),
      'UTC');
    expect(days[0].precipitation).toBe(8.8);
  });

  it('reports no rain for a day the forecast does not mention', () => {
    const days = daytimeForecast(payload({ temperatureMean1h: flat(12, 24) }), 'UTC');
    expect(days[0].precipitation).toBe(0);
  });

  it('keeps a day the forecast only half covers', () => {
    // Today is usually part gone when this runs.
    const late = { start: Date.parse('2026-09-07T15:00:00Z'), temperatureMean1h: flat(14, 6) };
    const days = daytimeForecast({ graph: late }, 'UTC');
    expect(days[0]).toMatchObject({ date: '2026-09-07', hours: 3 });
  });

  it('survives the missing pieces the endpoint may send', () => {
    expect(daytimeForecast(payload(), 'UTC')).toEqual([]);
    expect(daytimeForecast({ graph: {} }, 'UTC')).toEqual([]);
    expect(daytimeForecast({}, 'UTC')).toEqual([]);
    const days = daytimeForecast(payload({ temperatureMean1h: flat(10, 24) }), 'UTC');
    expect(days[0].sunshine).toBe(0);
  });

  it('matches what the MeteoSwiss app itself shows', () => {
    // Captured from plzDetail for 8044, the day the numbers were compared
    // against the app on a phone. Its weekly list read:
    //   Mon 07 Sep  16° | 28°   <1 mm
    //   Tue 08 Sep  18° | 31°   <1 mm
    // Our maxima are the app's exactly; our minima sit higher because they
    // cover 08:00–18:00 only, which is the whole point of this window.
    const days = daytimeForecast(real as WeatherPayload, 'Europe/Zurich');

    const monday = days.find(d => d.date === '2026-09-07')!;
    expect(monday.hours).toBe(10);
    expect(monday.tempMax).toBe(28);
    expect(monday.tempMin).toBeGreaterThan(16);
    expect(monday.precipitation).toBe(0.2);

    const tuesday = days.find(d => d.date === '2026-09-08')!;
    expect(tuesday.tempMax).toBe(31);
    expect(tuesday.tempMin).toBeGreaterThan(18);
    expect(tuesday.precipitation).toBe(0.7);

    // The wet day the app marks with 9 mm.
    const wednesday = days.find(d => d.date === '2026-09-09')!;
    expect(wednesday.precipitation).toBe(8.8);
    expect(weatherSymbol(wednesday)).toBe('rain');
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

  it('treats under a millimetre a day as dry', () => {
    // The line MeteoSwiss draws itself: below it their app writes "<1 mm".
    expect(weatherSymbol(day({ precipitation: 0.7, sunshine: 0.9 }))).toBe('sunny');
    expect(weatherSymbol(day({ precipitation: 1, sunshine: 0.9 }))).toBe('showers');
  });
});
