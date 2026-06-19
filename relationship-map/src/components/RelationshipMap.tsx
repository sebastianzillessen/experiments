import { useMemo } from "react";
import { computeLayout } from "../lib/polar.ts";
import type { Category, MapResponse } from "../types.ts";
import { MapNode } from "./MapNode.tsx";

const SIZE = 720;

interface Props {
  map: MapResponse;
  categories: Category[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function RelationshipMap({ map, categories, selectedId, onSelect }: Props) {
  const layout = useMemo(
    () => computeLayout(map.people, categories, SIZE),
    [map.people, categories],
  );

  return (
    <svg
      className="relationship-map"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="Relationship map"
    >
      {/* Concentric guide rings */}
      {layout.rings.map((ring) => (
        <g key={ring.rating}>
          <circle
            cx={layout.cx}
            cy={layout.cy}
            r={ring.radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={1}
          />
          <text
            x={layout.cx + 4}
            y={layout.cy - ring.radius - 2}
            className="ring-label"
          >
            {ring.rating}
          </text>
        </g>
      ))}

      {/* Nodes */}
      {layout.nodes.map((node) => (
        <MapNode
          key={node.person.id}
          layout={node}
          cx={layout.cx}
          cy={layout.cy}
          selected={node.person.id === selectedId}
          onSelect={onSelect}
        />
      ))}

      {/* Centre: self */}
      <circle
        cx={layout.cx}
        cy={layout.cy}
        r={14}
        fill="#0f172a"
        stroke="#fff"
        strokeWidth={3}
      />
      <text
        x={layout.cx}
        y={layout.cy + 30}
        textAnchor="middle"
        className="self-label"
      >
        {map.self_name}
      </text>

      {map.people.length === 0 && (
        <text
          x={layout.cx}
          y={layout.cy + 60}
          textAnchor="middle"
          className="empty-hint"
        >
          Add people to start mapping your relationships
        </text>
      )}
    </svg>
  );
}
