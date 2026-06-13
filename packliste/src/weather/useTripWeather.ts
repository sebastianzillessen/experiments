import { useEffect, useState } from "react";
import { fetchDailyForecast, geocodePlace, type GeoPlace } from "./openMeteo";
import {
  clampForecastRange,
  recommendConditions,
  summarizeForecast,
  type Recommendation,
  type WeatherSummary,
} from "./suggest";

export type WeatherStatus =
  | "idle" // kein Reiseziel eingegeben
  | "loading"
  | "ready"
  | "too-far" // Reisebeginn > 14 Tage entfernt
  | "past" // Zeitraum liegt in der Vergangenheit
  | "not-found" // Ort nicht gefunden
  | "error";

export interface TripWeather {
  status: WeatherStatus;
  place?: GeoPlace;
  summary?: WeatherSummary;
  recommendation?: Recommendation;
}

const DEBOUNCE_MS = 600;

/**
 * Holt — sofern Reiseziel gesetzt und der Zeitraum ≤ 14 Tage entfernt ist —
 * die Wettervorhersage und leitet Empfehlungen ab. Debounced + abbrechbar;
 * blockiert nie die Trip-Erstellung.
 */
export function useTripWeather(
  destination: string | undefined,
  startDate?: string,
  endDate?: string,
): TripWeather {
  const [state, setState] = useState<TripWeather>({ status: "idle" });

  useEffect(() => {
    const dest = (destination ?? "").trim();
    if (!dest) {
      setState({ status: "idle" });
      return;
    }
    const range = clampForecastRange(startDate, endDate);
    if (!range.ok) {
      if (range.reason === "missing") setState({ status: "idle" });
      else if (range.reason === "too-far") setState({ status: "too-far" });
      else setState({ status: "past" });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(async () => {
      setState({ status: "loading" });
      try {
        const place = await geocodePlace(dest, controller.signal);
        if (cancelled) return;
        if (!place) {
          setState({ status: "not-found" });
          return;
        }
        const forecast = await fetchDailyForecast(
          place.latitude,
          place.longitude,
          range.start,
          range.end,
          controller.signal,
        );
        if (cancelled) return;
        const summary = summarizeForecast(forecast);
        setState({
          status: "ready",
          place,
          summary,
          recommendation: recommendConditions(summary),
        });
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setState({ status: "error" });
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [destination, startDate, endDate]);

  return state;
}
