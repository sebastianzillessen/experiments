import { useEffect, useState } from "react";
import { api } from "../api/client.ts";
import { CONTACT_FREQUENCIES } from "../types.ts";
import type {
  Category,
  ContactFrequency,
  MapPerson,
  RatingLogEntry,
} from "../types.ts";
import { RatingTrend } from "./RatingTrend.tsx";

interface Props {
  person: MapPerson;
  categories: Category[];
  liveMode: boolean;
  onChanged: () => void;
  onClose: () => void;
}

export function PersonPanel({
  person,
  categories,
  liveMode,
  onChanged,
  onClose,
}: Props) {
  const [history, setHistory] = useState<RatingLogEntry[]>([]);
  const [rating, setRating] = useState(person.rating);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRating(person.rating);
    setNote("");
    void api.getHistory(person.id).then(setHistory);
  }, [person.id, person.rating]);

  const categoryName =
    categories.find((c) => c.id === person.category_id)?.name ?? "—";

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveRating = () =>
    run(async () => {
      await api.changeRating(person.id, rating, note.trim() || null);
      setHistory(await api.getHistory(person.id));
      setNote("");
    });

  return (
    <aside className="person-panel">
      <div className="panel-head">
        <h2>{person.name}</h2>
        <button className="ghost" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {!liveMode && (
        <p className="muted">
          Viewing a past snapshot — switch to the live map to make changes.
        </p>
      )}

      <dl className="panel-meta">
        <div>
          <dt>Group</dt>
          <dd>
            {liveMode ? (
              <select
                value={person.category_id}
                onChange={(e) =>
                  run(() =>
                    api.updatePerson(person.id, {
                      category_id: Number(e.target.value),
                    }),
                  )
                }
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              categoryName
            )}
          </dd>
        </div>
        <div>
          <dt>Contact</dt>
          <dd>
            {liveMode ? (
              <select
                value={person.contact_frequency}
                onChange={(e) =>
                  run(() =>
                    api.updatePerson(person.id, {
                      contact_frequency: e.target.value as ContactFrequency,
                    }),
                  )
                }
              >
                {CONTACT_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            ) : (
              person.contact_frequency
            )}
          </dd>
        </div>
      </dl>

      {liveMode && (
        <div className="rating-editor">
          <label>
            Closeness: <strong>{rating}</strong>
            <input
              type="range"
              min={1}
              max={10}
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
            />
          </label>
          <input
            className="note-input"
            placeholder="Optional note for this change"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            className="primary"
            disabled={rating === person.rating}
            onClick={saveRating}
          >
            Save closeness
          </button>
        </div>
      )}

      <h3>History</h3>
      <RatingTrend history={history} />
      <ul className="history-list">
        {[...history].reverse().map((h) => (
          <li key={h.id}>
            <span className="history-date">
              {new Date(h.changed_at).toLocaleDateString()}
            </span>
            <span className="history-rating">
              {h.old_rating === null
                ? `set to ${h.new_rating}`
                : `${h.old_rating} → ${h.new_rating}`}
            </span>
            {h.note && <span className="history-note">{h.note}</span>}
          </li>
        ))}
      </ul>

      {liveMode && (
        <button
          className="archive-btn"
          onClick={() =>
            run(async () => {
              await api.updatePerson(person.id, { archived: true });
              onClose();
            })
          }
        >
          Archive person
        </button>
      )}

      {error && <p className="error">{error}</p>}
    </aside>
  );
}
