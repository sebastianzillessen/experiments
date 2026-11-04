import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.ts";
import { UNCATEGORISED } from "../lib/polar.ts";
import type { Category, Person } from "../types.ts";

interface Props {
  categories: Category[];
  /** Notify the parent so the map reflects edits when switching back. */
  onChanged: () => void;
}

/**
 * Triage screen for the import backlog: everyone still in the "Uncategorised"
 * group (placed or hidden). Assign a group, set closeness, or show/hide — each
 * action persists immediately and drops the person out of the backlog once
 * they're given a real group.
 */
export function ClassifyView({ categories, onChanged }: Props) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const uncategorised = categories.find((c) => c.name === UNCATEGORISED);
  const groups = categories.filter((c) => c.name !== UNCATEGORISED);

  const reload = useCallback(async () => {
    const all = await api.listPeople(true);
    setPeople(all.filter((p) => uncategorised != null && p.category_id === uncategorised.id));
  }, [uncategorised]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const after = async () => {
    await reload();
    onChanged();
  };

  const setGroup = async (id: number, categoryId: number) => {
    await api.updatePerson(id, { category_id: categoryId });
    await after();
  };
  const toggleArchived = async (p: Person) => {
    await api.updatePerson(p.id, { archived: !p.archived });
    await after();
  };
  const setRating = async (id: number, rating: number) => {
    await api.changeRating(id, rating);
    await after();
  };

  if (!people) return <div className="loading">Loading…</div>;

  return (
    <section className="classify">
      <header className="classify-head">
        <h2>Sort your contacts</h2>
        <p className="muted">
          {people.length} uncategorised · assign a group, set closeness, or hide
        </p>
      </header>

      {people.length === 0 ? (
        <p className="empty-hint">Nothing to sort — everyone has a group. 🎉</p>
      ) : (
        <ul className="classify-list">
          {people.map((p) => (
            <li key={p.id} className={`classify-row${p.archived ? " is-archived" : ""}`}>
              <span className="classify-name">{p.name}</span>

              <span className="classify-groups">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    className="group-chip"
                    style={{ borderColor: g.color }}
                    onClick={() => setGroup(p.id, g.id)}
                    title={`Move to ${g.name}`}
                  >
                    <span className="swatch" style={{ background: g.color }} />
                    {g.name}
                  </button>
                ))}
              </span>

              <RatingCell value={p.current_rating} onCommit={(r) => setRating(p.id, r)} />

              <button className="ghost classify-hide" onClick={() => toggleArchived(p)}>
                {p.archived ? "Show on map" : "Hide"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Closeness slider that only commits when the user releases it. */
function RatingCell({ value, onCommit }: { value: number; onCommit: (r: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v !== value) onCommit(v);
  };
  return (
    <label className="classify-rating">
      <input
        type="range"
        min={1}
        max={10}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        aria-label="Closeness"
      />
      <strong>{v}</strong>
    </label>
  );
}
