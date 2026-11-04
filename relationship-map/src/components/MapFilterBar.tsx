import type { MapFilters } from "../lib/filter.ts";

interface Props {
  filters: MapFilters;
  onChange: (next: MapFilters) => void;
  /** Id of the "Uncategorised" group, if it exists, for the quick toggle. */
  uncategorisedId: number | null;
  /** People currently shown / total placed, for context. */
  shown: number;
  total: number;
}

export function MapFilterBar({ filters, onChange, uncategorisedId, shown, total }: Props) {
  const set = (patch: Partial<MapFilters>) => onChange({ ...filters, ...patch });
  const uncatHidden =
    uncategorisedId != null && filters.hiddenGroups.includes(uncategorisedId);

  const toggleUncat = () => {
    if (uncategorisedId == null) return;
    const hiddenGroups = uncatHidden
      ? filters.hiddenGroups.filter((id) => id !== uncategorisedId)
      : [...filters.hiddenGroups, uncategorisedId];
    set({ hiddenGroups });
  };

  return (
    <div className="filter-bar">
      <label>
        Min closeness <strong>{filters.minRating}</strong>
        <input
          type="range"
          min={1}
          max={10}
          value={filters.minRating}
          onChange={(e) => set({ minRating: Number(e.target.value) })}
        />
      </label>

      <label>
        Top closest
        <input
          type="number"
          min={1}
          max={total || 1}
          placeholder="All"
          value={filters.topN ?? ""}
          onChange={(e) => set({ topN: e.target.value ? Number(e.target.value) : null })}
        />
      </label>

      {uncategorisedId != null && (
        <label className="filter-check">
          <input type="checkbox" checked={uncatHidden} onChange={toggleUncat} />
          Hide uncategorised
        </label>
      )}

      <span className="filter-count">
        {shown} / {total} shown
      </span>
    </div>
  );
}
