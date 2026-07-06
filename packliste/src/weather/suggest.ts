import type { DailyForecast } from "./openMeteo";

// Wörter, die in Trip-Namen häufig vorkommen, aber kein Ort sind. Werden bei
// der Ortserkennung entfernt.
const STOPWORDS = new Set([
  // Trip-Begriffe
  "wochenende", "urlaub", "ferien", "reise", "trip", "ausflug", "kurztrip",
  "städtetrip", "staedtetrip", "tour", "wanderung", "skiurlaub", "skiferien",
  "roadtrip", "camping", "tagestrip", "tage", "tag", "nacht", "nächte",
  // Jahreszeiten
  "frühling", "fruehling", "sommer", "herbst", "winter",
  // Artikel / Präpositionen / Konjunktionen
  "mit", "und", "der", "die", "das", "den", "dem", "ein", "eine", "einen",
  "am", "im", "zum", "zur", "bei", "für", "fuer", "von", "vom",
  // Wochentage
  "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag",
  // Monate
  "januar", "februar", "märz", "maerz", "april", "mai", "juni", "juli",
  "august", "september", "oktober", "november", "dezember",
]);

// Präpositionen, nach denen typischerweise ein Ort folgt.
const LOCATION_PREPS = new Set(["in", "nach", "auf", "an"]);

/**
 * Versucht aus einem frei getippten Trip-Namen einen Ortskandidaten zu
 * gewinnen. Heuristik: Steht eine Orts-Präposition ("in/nach/…") im Namen,
 * werden die folgenden Wörter genommen; sonst alle Wörter, die keine
 * Stopwörter/Zahlen sind. Leeres Ergebnis ⇒ kein Auto-Vorschlag.
 */
export function detectPlaceFromName(name: string): string {
  const raw = name.trim();
  if (!raw) return "";
  // Bei "... in Berlin" o.ä. den Teil nach der Präposition bevorzugen.
  const tokens = raw.split(/\s+/);
  const lower = tokens.map((t) => t.toLowerCase().replace(/[.,;:!?]+$/, ""));
  const prepIdx = lower.findIndex((t) => LOCATION_PREPS.has(t));
  const candidateTokens =
    prepIdx >= 0 && prepIdx < tokens.length - 1
      ? tokens.slice(prepIdx + 1)
      : tokens;
  const kept = candidateTokens.filter((t) => {
    const norm = t.toLowerCase().replace(/[.,;:!?]+$/, "");
    if (!norm) return false;
    if (STOPWORDS.has(norm)) return false;
    if (/^\d+$/.test(norm)) return false; // reine Zahlen
    return true;
  });
  return kept.join(" ").trim();
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function diffDays(from: Date, to: Date): number {
  const a = Date.parse(isoDay(from));
  const b = Date.parse(isoDay(to));
  return Math.round((b - a) / MS_PER_DAY);
}

export type RangeResult =
  | { ok: true; start: string; end: string }
  | { ok: false; reason: "missing" | "too-far" | "past" };

/**
 * Bestimmt den abrufbaren Vorhersagezeitraum. Open-Meteo liefert ~16 Tage
 * ab heute; wir zeigen Wetter nur, wenn der Reisebeginn ≤ 14 Tage entfernt
 * ist. Der Bereich wird auf [heute, heute+15] geklemmt.
 */
export function clampForecastRange(
  startDate?: string,
  endDate?: string,
  now: Date = new Date(),
): RangeResult {
  if (!startDate) return { ok: false, reason: "missing" };
  const start = new Date(startDate);
  const end = new Date(endDate || startDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, reason: "missing" };
  }
  const daysToStart = diffDays(now, start);
  if (daysToStart > 14) return { ok: false, reason: "too-far" };
  const daysToEnd = diffDays(now, end);
  if (daysToEnd < 0) return { ok: false, reason: "past" };
  // Auf das verfügbare Vorhersagefenster begrenzen.
  const maxEnd = new Date(now.getTime() + 15 * MS_PER_DAY);
  const rangeStart = start.getTime() < now.getTime() ? now : start;
  const rangeEnd = end.getTime() > maxEnd.getTime() ? maxEnd : end;
  return { ok: true, start: isoDay(rangeStart), end: isoDay(rangeEnd) };
}

export interface WeatherSummary {
  tMin: number;
  tMax: number;
  maxPrecipProb: number;
  anySnow: boolean;
}

// WMO-Wettercodes für Schnee/Schneeregen.
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

export function summarizeForecast(f: DailyForecast): WeatherSummary {
  return {
    tMin: Math.min(...f.tempMin),
    tMax: Math.max(...f.tempMax),
    maxPrecipProb: Math.max(...f.precipitationProbabilityMax),
    anySnow: f.weatherCode.some((c) => SNOW_CODES.has(c)),
  };
}

export interface Recommendation {
  /** Bedingungs-Keys aus dem bestehenden System (sun/rain/cold). */
  conditions: string[];
  /** Menschlich lesbare Begründungen, eine pro empfohlener Bedingung. */
  reasons: string[];
}

/**
 * Konkrete Item-Vorschläge pro Wetter-Bedingung. Werden im Wetter-Hinweis
 * als per Tap hinzufügbare Chips angeboten (bereits vorhandene übersprungen).
 */
export const WEATHER_ITEMS: Record<string, string[]> = {
  sun: ["Sonnencreme", "Sonnenhut", "Sonnenbrille"],
  rain: ["Regenjacke", "Regenschirm"],
  cold: ["Winterjacke", "Mütze", "Handschuhe"],
};

/**
 * Leitet aus der Wetterzusammenfassung empfohlene Bedingungen ab. Schwellen:
 * heiß ≥25°C → Sonne, Regenwahrscheinlichkeit ≥50% → Regen, kalt ≤3°C oder
 * Schnee → Kälte. "Schwimmen" wird bewusst nicht abgeleitet (nicht zuverlässig
 * aus dem Wetter bestimmbar).
 */
export function recommendConditions(s: WeatherSummary): Recommendation {
  const conditions: string[] = [];
  const reasons: string[] = [];
  if (s.tMax >= 25) {
    conditions.push("sun");
    reasons.push(`Heiß (bis ${Math.round(s.tMax)}°C) — an Sonnenschutz denken (Sonnencreme, Sonnenhut).`);
  }
  if (s.maxPrecipProb >= 50) {
    conditions.push("rain");
    reasons.push(`Regen wahrscheinlich (${Math.round(s.maxPrecipProb)}%) — Regenjacke/Regenschirm einpacken.`);
  }
  if (s.tMin <= 3 || s.anySnow) {
    conditions.push("cold");
    reasons.push(
      s.anySnow
        ? "Schnee möglich — Winterkleidung einpacken."
        : `Kalt (bis ${Math.round(s.tMin)}°C) — Winterkleidung einpacken.`,
    );
  }
  return { conditions, reasons };
}
