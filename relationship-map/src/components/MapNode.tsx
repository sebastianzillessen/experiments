import type { PointerEvent } from "react";
import type { NodeLayout } from "../lib/polar.ts";

interface Props {
  layout: NodeLayout;
  cx: number;
  cy: number;
  /** Overrides the layout position while this node is being dragged. */
  override?: { x: number; y: number };
  selected: boolean;
  draggable: boolean;
  onSelect: (id: number) => void;
  onPointerDown: (e: PointerEvent, id: number) => void;
}

/** A single person node: a line from the centre, a circle, and a label. */
export function MapNode({
  layout,
  cx,
  cy,
  override,
  selected,
  draggable,
  onSelect,
  onPointerDown,
}: Props) {
  const { person, color } = layout;
  const x = override?.x ?? layout.x;
  const y = override?.y ?? layout.y;
  // Stronger relationships get a thicker, more opaque connecting line.
  const strokeWidth = 0.6 + (person.rating / 10) * 2.6;
  const lineOpacity = 0.25 + (person.rating / 10) * 0.55;
  const r = selected ? 9 : 7;

  return (
    <g
      className="map-node"
      role="button"
      tabIndex={0}
      aria-label={`${person.name}, rating ${person.rating}`}
      style={{ cursor: draggable ? "grab" : "pointer" }}
      onPointerDown={(e) => onPointerDown(e, person.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(person.id);
      }}
    >
      <line
        x1={cx}
        y1={cy}
        x2={x}
        y2={y}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeOpacity={lineOpacity}
        style={{ transition: override ? "none" : "all 0.4s ease" }}
      />
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={color}
        stroke={selected ? "#0f172a" : "#fff"}
        strokeWidth={selected ? 3 : 1.5}
        style={{ transition: override ? "none" : "cx 0.4s ease, cy 0.4s ease, r 0.15s ease" }}
      />
      <text
        x={x}
        y={y - r - 4}
        textAnchor="middle"
        className="map-node-label"
        style={{ transition: override ? "none" : "all 0.4s ease" }}
      >
        {person.name}
      </text>
    </g>
  );
}
