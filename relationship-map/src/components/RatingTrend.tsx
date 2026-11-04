import { useMemo } from "react";
import type { RatingLogEntry } from "../types.ts";

interface Props {
  history: RatingLogEntry[];
}

const W = 320;
const H = 140;
const PAD = { top: 12, right: 12, bottom: 22, left: 26 };

/** A step-line chart of a person's rating over time (rating holds until changed). */
export function RatingTrend({ history }: Props) {
  const geom = useMemo(() => {
    if (history.length === 0) return null;
    const times = history.map((h) => new Date(h.changed_at).getTime());
    const minT = times[0];
    const maxT = Math.max(times[times.length - 1], Date.now());
    const spanT = maxT - minT || 1;

    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const xOf = (t: number) => PAD.left + ((t - minT) / spanT) * innerW;
    const yOf = (rating: number) =>
      PAD.top + ((10 - rating) / 9) * innerH;

    const points = history.map((h, i) => ({
      x: xOf(times[i]),
      y: yOf(h.new_rating),
      entry: h,
    }));

    // Build a step path, extended to "now" so the current rating is visible.
    let d = "";
    points.forEach((p, i) => {
      if (i === 0) {
        d += `M ${p.x} ${p.y}`;
      } else {
        d += ` H ${p.x} V ${p.y}`;
      }
    });
    const lastY = points[points.length - 1].y;
    d += ` H ${xOf(maxT)} `;
    void lastY;

    return { points, d, yOf };
  }, [history]);

  if (!geom) return <p className="muted">No history yet.</p>;

  return (
    <svg
      className="rating-trend"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Rating over time"
    >
      {[2, 4, 6, 8, 10].map((r) => (
        <g key={r}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={geom.yOf(r)}
            y2={geom.yOf(r)}
            stroke="#eef2f7"
          />
          <text x={2} y={geom.yOf(r) + 3} className="axis-label">
            {r}
          </text>
        </g>
      ))}
      <path d={geom.d} fill="none" stroke="#3b82f6" strokeWidth={2} />
      {geom.points.map((p) => (
        <circle key={p.entry.id} cx={p.x} cy={p.y} r={3} fill="#3b82f6">
          <title>
            {new Date(p.entry.changed_at).toLocaleString()} → {p.entry.new_rating}
            {p.entry.note ? `\n${p.entry.note}` : ""}
          </title>
        </circle>
      ))}
    </svg>
  );
}
