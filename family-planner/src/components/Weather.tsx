import { useCallback, useState } from 'react';
import { weatherSymbol } from '../../supabase/functions/family-weather/weather.ts';
import type { WeatherDay } from '../lib/types.ts';

const STORAGE_KEY = 'fp.weatherDetail';

/**
 * Emoji rather than MeteoSwiss's own symbol files: those would have to be
 * fetched per day from a government server, which a planner on a wall cannot
 * rely on and an offline PWA cannot do at all.
 */
const SYMBOLS: Record<string, { emoji: string; label: string }> = {
  sunny: { emoji: '☀️', label: 'sonnig' },
  partly: { emoji: '🌤️', label: 'teils sonnig' },
  cloudy: { emoji: '☁️', label: 'bewölkt' },
  showers: { emoji: '🌦️', label: 'Regenschauer' },
  rain: { emoji: '🌧️', label: 'Regen' },
  snow: { emoji: '🌨️', label: 'Schnee' },
};

/**
 * Symbol or figures, for the whole table at once and remembered per device.
 * Per-day would leave the column in a mixed state nobody asked for.
 */
export function useWeatherDetail(): [boolean, () => void] {
  const [detailed, setDetailed] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setDetailed(was => {
      const next = !was;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Not remembering it is survivable.
      }
      return next;
    });
  }, []);

  return [detailed, toggle];
}

/** The forecast for one day, in the row's first cell. */
export function WeatherCell(
  { day, detailed, onToggle }: { day?: WeatherDay; detailed: boolean; onToggle: () => void }
) {
  if (!day) return null;

  const symbol = SYMBOLS[weatherSymbol(day)] ?? SYMBOLS.cloudy;
  const figures = `${day.tempMin}–${day.tempMax}°`;
  const rain = day.precipitation >= 0.1 ? `${day.precipitation} mm` : '';
  const spoken = `${symbol.label}, ${figures}${rain ? `, ${rain}` : ''}`;

  return (
    <button type="button" className="weather" onClick={onToggle}
      title={spoken} aria-label={`Wetter: ${spoken}`}>
      {detailed ? (
        <>
          <span className="weather-temp">{figures}</span>
          {rain && <span className="weather-rain">{rain}</span>}
        </>
      ) : (
        <span className="weather-symbol" aria-hidden="true">{symbol.emoji}</span>
      )}
    </button>
  );
}
