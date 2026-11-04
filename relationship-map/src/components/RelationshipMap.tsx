import { useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { categoryAtPoint, computeLayout, ratingAtPoint } from "../lib/polar.ts";
import type { Category, MapResponse } from "../types.ts";
import { MapNode } from "./MapNode.tsx";

const SIZE = 720;
const DRAG_THRESHOLD = 4; // px in SVG space before a press becomes a drag

interface Props {
  map: MapResponse;
  categories: Category[];
  selectedId: number | null;
  /** Dragging edits the live map only; history is read-only. */
  draggable: boolean;
  onSelect: (id: number) => void;
  /** Fired on drop: new rating from distance, new category from wedge. */
  onMove: (id: number, rating: number, categoryId: number) => void;
}

interface DragState {
  id: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
}

export function RelationshipMap({
  map,
  categories,
  selectedId,
  draggable,
  onSelect,
  onMove,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const layout = useMemo(
    () => computeLayout(map.people, categories, SIZE),
    [map.people, categories],
  );

  const toSvg = (e: PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  const handlePointerDown = (e: PointerEvent, id: number) => {
    if (!draggable) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const { x, y } = toSvg(e);
    setDrag({ id, startX: x, startY: y, x, y, moved: false });
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!drag) return;
    const { x, y } = toSvg(e);
    const moved = drag.moved || Math.hypot(x - drag.startX, y - drag.startY) > DRAG_THRESHOLD;
    setDrag({ ...drag, x, y, moved });
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (!drag) return;
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (drag.moved) {
      const rating = ratingAtPoint(drag.x, drag.y, SIZE);
      const category = categoryAtPoint(drag.x, drag.y, categories, SIZE);
      onMove(drag.id, rating, category.id);
    } else {
      onSelect(drag.id);
    }
    setDrag(null);
  };

  return (
    <svg
      ref={svgRef}
      className="relationship-map"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="Relationship map"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
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
          <text x={layout.cx + 4} y={layout.cy - ring.radius - 2} className="ring-label">
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
          override={drag?.moved && drag.id === node.person.id ? { x: drag.x, y: drag.y } : undefined}
          selected={node.person.id === selectedId}
          draggable={draggable}
          onSelect={onSelect}
          onPointerDown={handlePointerDown}
        />
      ))}

      {/* Centre: self */}
      <circle cx={layout.cx} cy={layout.cy} r={14} fill="#0f172a" stroke="#fff" strokeWidth={3} />
      <text x={layout.cx} y={layout.cy + 30} textAnchor="middle" className="self-label">
        {map.self_name}
      </text>

      {map.people.length === 0 && (
        <text x={layout.cx} y={layout.cy + 60} textAnchor="middle" className="empty-hint">
          Add people to start mapping your relationships
        </text>
      )}
    </svg>
  );
}
