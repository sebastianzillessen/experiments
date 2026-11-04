import { useState } from "react";
import { api } from "../api/client.ts";
import type { Category } from "../types.ts";

interface Props {
  categories: Category[];
  onChange: () => void;
  /** Category ids currently hidden from the map. */
  hiddenGroups: number[];
  /** Toggle a group's visibility on the map. */
  onToggleVisibility: (id: number) => void;
}

const PALETTE = [
  "#e11d48",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];

export function CategoryLegend({
  categories,
  onChange,
  hiddenGroups,
  onToggleVisibility,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    try {
      await api.createCategory(name.trim(), color);
      setName("");
      setAdding(false);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: number) => {
    setError(null);
    try {
      await api.deleteCategory(id);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="legend">
      <div className="legend-head">
        <h3>Groups</h3>
        <button className="ghost" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      <ul className="legend-list">
        {categories.map((c) => {
          const hidden = hiddenGroups.includes(c.id);
          return (
            <li key={c.id} className={hidden ? "is-hidden" : undefined}>
              <button
                className="legend-eye"
                title={hidden ? "Show on map" : "Hide from map"}
                aria-pressed={!hidden}
                onClick={() => onToggleVisibility(c.id)}
              >
                {hidden ? "🙈" : "👁"}
              </button>
              <span className="swatch" style={{ background: c.color }} />
              <span className="legend-name">{c.name}</span>
              <button
                className="legend-del"
                title="Delete group"
                onClick={() => remove(c.id)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      {adding && (
        <div className="legend-add">
          <input
            placeholder="Group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="palette">
            {PALETTE.map((c) => (
              <button
                key={c}
                className={`palette-dot${c === color ? " active" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Pick color ${c}`}
              />
            ))}
          </div>
          <button className="primary" disabled={!name.trim()} onClick={add}>
            Add group
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
