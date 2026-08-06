import { useEffect, useRef, useState } from "react";
import type { TimelineResponse } from "../types.ts";

interface Props {
  timeline: TimelineResponse | null;
  value: string | null; // ISO timestamp, or null for live
  onChange: (at: string | null) => void;
}

/**
 * Scrubs the map across history. The slider spans from the first recorded change
 * to "now"; releasing at the far right (or pressing Live) returns to the live map.
 */
export function TimeSlider({ timeline, value, onChange }: Props) {
  const minT = timeline?.min ? new Date(timeline.min).getTime() : null;
  const maxT = Date.now();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<number>(maxT);

  useEffect(() => {
    setPos(value ? new Date(value).getTime() : maxT);
    // maxT changes every render; intentionally only sync on `value` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (minT === null || !timeline || timeline.dates.length <= 1) {
    return (
      <div className="time-slider empty">
        <span className="muted">
          History appears here once you record rating changes over time.
        </span>
      </div>
    );
  }

  const handle = (raw: number) => {
    setPos(raw);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      // Snap to live when at (or very near) the right edge.
      if (raw >= maxT - 1000) onChange(null);
      else onChange(new Date(raw).toISOString());
    }, 120);
  };

  const isLive = value === null;
  const label = isLive
    ? "Live · now"
    : new Date(value).toLocaleString();

  return (
    <div className="time-slider">
      <div className="time-slider-head">
        <span className="time-label">{label}</span>
        {!isLive && (
          <button className="ghost" onClick={() => onChange(null)}>
            Jump to live
          </button>
        )}
      </div>
      <input
        type="range"
        min={minT}
        max={maxT}
        step={1000}
        value={pos}
        onChange={(e) => handle(Number(e.target.value))}
        aria-label="Time slider"
      />
      <div className="time-slider-ends">
        <span>{new Date(minT).toLocaleDateString()}</span>
        <span>now</span>
      </div>
    </div>
  );
}
