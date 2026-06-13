// Open-Meteo: kostenlose, key-freie, CORS-fähige APIs. Wir rufen sie direkt
// aus dem Browser auf (kein Worker-Proxy nötig).
//
// Hinweis Datenschutz: der eingegebene Ortstext wird an Open-Meteo gesendet,
// um Koordinaten zu bestimmen.

export interface GeoPlace {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export interface DailyForecast {
  /** ISO-Datum (YYYY-MM-DD) pro Tag. */
  dates: string[];
  tempMax: number[];
  tempMin: number[];
  precipitationProbabilityMax: number[];
  /** WMO-Wettercode pro Tag (https://open-meteo.com/en/docs). */
  weatherCode: number[];
}

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

/** Bestes Geocoding-Ergebnis für den Ortstext, oder null wenn nichts passt. */
export async function geocodePlace(
  query: string,
  signal?: AbortSignal,
): Promise<GeoPlace | null> {
  const q = query.trim();
  if (!q) return null;
  const url = `${GEO_URL}?name=${encodeURIComponent(q)}&count=1&language=de&format=json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{
      name: string;
      country?: string;
      latitude: number;
      longitude: number;
    }>;
  };
  const hit = data.results?.[0];
  if (!hit) return null;
  return {
    name: hit.name,
    country: hit.country,
    latitude: hit.latitude,
    longitude: hit.longitude,
  };
}

/** Tägliche Vorhersage für den Zeitraum [startDate, endDate] (ISO-Daten). */
export async function fetchDailyForecast(
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<DailyForecast> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily:
      "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    timezone: "auto",
    start_date: startDate,
    end_date: endDate,
  });
  const res = await fetch(`${FORECAST_URL}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Forecast HTTP ${res.status}`);
  const data = (await res.json()) as {
    daily?: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: (number | null)[];
      weather_code: number[];
    };
  };
  const d = data.daily;
  if (!d || !d.time?.length) throw new Error("Keine Vorhersagedaten");
  return {
    dates: d.time,
    tempMax: d.temperature_2m_max,
    tempMin: d.temperature_2m_min,
    precipitationProbabilityMax: d.precipitation_probability_max.map((v) => v ?? 0),
    weatherCode: d.weather_code,
  };
}
