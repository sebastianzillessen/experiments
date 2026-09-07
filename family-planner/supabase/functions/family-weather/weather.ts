// The weather for the hours a family actually plans in.
//
// MeteoSwiss gives a daily forecast, but its minimum is the one at four in the
// morning — useless next to a school week. The hourly series in `graph` is the
// one worth reading: this narrows it to the daytime window and gives, per day,
// the coldest and warmest it gets and how much rain falls in between.
//
// The endpoint behind this (`plzDetail`) is the one the MeteoSwiss app uses.
// It is not documented and can change without notice, which is why everything
// here treats a missing or short array as normal rather than as an error.

const HOUR_MS = 3_600_000;

export type WeatherDay = {
  /** yyyy-mm-dd in the family's zone. */
  date: string;
  /** Whole degrees; the coldest and warmest hour inside the window. */
  tempMin: number;
  tempMax: number;
  /** Millimetres over the window, one decimal. */
  precipitation: number;
  /** Share of the window that saw sun, 0 to 1. */
  sunshine: number;
  /** Hours of the window the forecast actually covered. */
  hours: number;
};

/**
 * What the day looks like, worked out from the numbers above.
 *
 * Deliberately not taken from `weatherIcon3h`: those numbers are undocumented,
 * and the only meaning that can be read out of the published symbol files is
 * "light cloud", "dark cloud" and "lightning" — not enough to tell rain from
 * snow. Sunshine minutes and millimetres are plain measurements, so the symbol
 * is derived from them and can be checked.
 */
export type WeatherSymbol = 'sunny' | 'partly' | 'cloudy' | 'showers' | 'rain' | 'snow';

/**
 * The shape this reads out of `plzDetail`. Everything is optional on purpose.
 *
 * Two traps in here, both found by checking our numbers against what the
 * MeteoSwiss app shows for the same postal code:
 *
 * `temperatureMin1h` / `temperatureMax1h` are NOT the coldest and warmest
 * point within the hour — they are an uncertainty band, like the wind's q10
 * and q90. In the first hour of a run all three series are equal to the
 * decimal, and the band only widens with lead time. The forecast itself is
 * `temperatureMean1h`, and its daily extremes reproduce the figures MeteoSwiss
 * publishes for the day. Reading the band gave us 32° where the app said 31°.
 *
 * And `precipitation1h` does not start at `start`. The first ~23 hours come as
 * `precipitation10m` instead, and the hourly series picks up at
 * `startLowResolution`. Aligning it to `start` moved a whole day's rain onto
 * the day before.
 */
export type WeatherGraph = {
  start?: number;
  /** The forecast itself. Use this, not the min/max band beside it. */
  temperatureMean1h?: number[];
  /** Minutes of sun per hour, 0 to 60. */
  sunshine1h?: number[];
};

/** One entry of the daily forecast the app itself shows. */
export type ForecastDay = {
  dayDate?: string;
  precipitation?: number;
};

export type WeatherPayload = {
  graph?: WeatherGraph;
  forecast?: ForecastDay[];
};

/** 4 digits, as Swiss postal codes are. */
export function isValidPlz(plz: string): boolean {
  return /^[1-9]\d{3}$/.test(plz.trim());
}

/** The endpoint wants the postal code with a two-digit suffix: 8134 → 813400. */
export function plzQuery(plz: string): string | null {
  const trimmed = plz.trim();
  return isValidPlz(trimmed) ? `${trimmed}00` : null;
}

type Clock = { date: string; hour: number };

/** Wall clock in a zone, without pulling in the calendar function's parser. */
function wallClock(ms: number, timeZone: string): Clock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
  };
}

/**
 * The daytime forecast per day.
 *
 * `fromHour` is inclusive and `toHour` exclusive, so 8 to 18 reads the hours
 * that begin at 08:00 through the one beginning at 17:00 — the span a school
 * day and a working day share.
 *
 * Today is usually half gone when this runs, so a day is kept as soon as one
 * hour of its window is covered; `hours` says how much stands behind it.
 */
export function daytimeForecast(
  payload: WeatherPayload, timeZone: string, fromHour = 8, toHour = 18
): WeatherDay[] {
  const graph = payload.graph ?? {};
  const start = graph.start;
  const temps = graph.temperatureMean1h ?? [];
  const sun = graph.sunshine1h ?? [];
  if (typeof start !== 'number' || temps.length === 0) return [];

  // Rain comes from the daily forecast, not from the hourly series: summing
  // the hours gives numbers that do not reconcile with the figure MeteoSwiss
  // publishes for the same day — for one Wednesday, 3.2mm against their 8.8,
  // below even their own stated lower bound. Until that is explained, the
  // number on screen is the one their app shows. It covers the whole day
  // rather than the window, which for "does it rain on Wednesday" is the more
  // useful reading anyway.
  const rainByDay = new Map<string, number>();
  for (const day of payload.forecast ?? []) {
    if (typeof day.dayDate === 'string' && typeof day.precipitation === 'number') {
      rainByDay.set(day.dayDate, day.precipitation);
    }
  }

  const byDay = new Map<string, { min: number; max: number; sun: number; hours: number }>();

  for (let i = 0; i < temps.length; i++) {
    const temp = temps[i];
    if (typeof temp !== 'number' || !Number.isFinite(temp)) continue;

    const { date, hour } = wallClock(start + i * HOUR_MS, timeZone);
    if (hour < fromHour || hour >= toHour) continue;

    const day = byDay.get(date) ?? { min: Infinity, max: -Infinity, sun: 0, hours: 0 };
    day.min = Math.min(day.min, temp);
    day.max = Math.max(day.max, temp);
    const minutes = sun[i];
    if (typeof minutes === 'number' && Number.isFinite(minutes)) day.sun += minutes;
    day.hours += 1;
    byDay.set(date, day);
  }

  return [...byDay.entries()]
    .filter(([, day]) => day.hours > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({
      date,
      tempMin: Math.round(day.min),
      tempMax: Math.round(day.max),
      // One decimal, and never "-0".
      precipitation: Math.round((rainByDay.get(date) ?? 0) * 10) / 10 || 0,
      sunshine: Math.round((day.sun / (day.hours * 60)) * 100) / 100,
      hours: day.hours,
    }));
}

/**
 * One symbol for the whole day.
 *
 * Rain decides first — an afternoon of drizzle is what you dress for, however
 * bright the morning was. Below freezing it falls as snow. Otherwise the share
 * of sunshine says how much of the sky was open.
 */
export function weatherSymbol(day: Pick<WeatherDay,
  'tempMax' | 'precipitation' | 'sunshine'>): WeatherSymbol {
  // A millimetre over a whole day is the line MeteoSwiss itself draws: below
  // it their app writes "<1 mm", which is not weather anyone dresses for.
  if (day.precipitation >= 1) {
    if (day.tempMax <= 2) return 'snow';
    return day.sunshine >= 0.3 ? 'showers' : 'rain';
  }
  if (day.sunshine >= 0.6) return 'sunny';
  if (day.sunshine >= 0.25) return 'partly';
  return 'cloudy';
}
