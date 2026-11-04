import type { ResolvedPerson } from "./types.ts";

export interface RatingPoint {
  changed_at: string;
  rating: number;
}

export interface ScoredPerson {
  external_key: string;
  name: string;
  /** Current recency-weighted score — used to rank who gets placed. */
  score: number;
  /** Monthly rating history, ascending; entries only where the rating changes. */
  history: RatingPoint[];
}

export interface ScoreOptions {
  halfLifeDays: number;
  nowMs: number;
}

const MS_PER_DAY = 86_400_000;

function monthStartUTC(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function nextMonthStartUTC(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/** Build the inclusive list of month-start timestamps from `minMs` to `nowMs`. */
function monthGrid(minMs: number, nowMs: number): number[] {
  const months: number[] = [];
  let m = monthStartUTC(minMs);
  const last = monthStartUTC(nowMs);
  while (m <= last) {
    months.push(m);
    m = nextMonthStartUTC(m);
  }
  return months;
}

/**
 * Reconstruct each person's rating over time from their interaction history.
 *
 * For each month we compute a recency-weighted score — every past message
 * contributes `0.5^(age / halfLife)`, so recent and frequent contact dominates.
 * A single global calibration (the distribution of *current* scores) maps scores
 * to 1–10 by percentile, so a person's rating reflects where they stand relative
 * to everyone else and trends as their own activity rises or falls.
 */
export function scorePeople(
  people: ResolvedPerson[],
  { halfLifeDays, nowMs }: ScoreOptions,
): ScoredPerson[] {
  const withEvents = people.filter((p) => p.events.length > 0);
  if (withEvents.length === 0) return [];

  const halfLifeMs = halfLifeDays * MS_PER_DAY;
  const allTs = withEvents.flatMap((p) => p.events.map((e) => e.tsMs));
  const months = monthGrid(Math.min(...allTs), nowMs);

  // Evaluate at each month's end (next month start, or now for the last month).
  const evalMs = months.map((_, i) =>
    i < months.length - 1 ? months[i + 1]! : nowMs,
  );

  const scoreAt = (person: ResolvedPerson, atMs: number): number => {
    let sum = 0;
    for (const e of person.events) {
      if (e.tsMs <= atMs) sum += Math.pow(0.5, (atMs - e.tsMs) / halfLifeMs);
    }
    return sum;
  };

  // Per-person monthly score series + their current (latest) score.
  const series = withEvents.map((p) => ({
    person: p,
    scores: evalMs.map((at) => scoreAt(p, at)),
  }));
  const currentSorted = series
    .map((s) => s.scores[s.scores.length - 1]!)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  const ratingFromScore = (score: number): number => {
    if (score <= 0) return 0;
    const rank = upperBound(currentSorted, score); // count of currentSorted <= score
    const percentile = rank / currentSorted.length;
    return Math.min(10, Math.max(1, Math.ceil(percentile * 10)));
  };

  return series.map(({ person, scores }) => {
    const history: RatingPoint[] = [];
    let prev = -1;
    scores.forEach((score, i) => {
      const rating = ratingFromScore(score);
      if (rating >= 1 && rating !== prev) {
        history.push({ changed_at: new Date(months[i]!).toISOString(), rating });
        prev = rating;
      }
    });
    return {
      external_key: person.external_key,
      name: person.name,
      score: scores[scores.length - 1]!,
      history,
    };
  });
}

/** Number of sorted values <= target (binary search). */
function upperBound(sorted: number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
