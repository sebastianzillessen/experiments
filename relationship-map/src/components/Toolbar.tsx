import { useEffect, useState } from "react";
import { api } from "../api/client.ts";
import { CONTACT_FREQUENCIES } from "../types.ts";
import type { Category, ContactFrequency } from "../types.ts";

interface Props {
  selfName: string;
  categories: Category[];
  liveMode: boolean;
  onChanged: () => void;
}

export function Toolbar({ selfName, categories, liveMode, onChanged }: Props) {
  const [name, setName] = useState(selfName);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  useEffect(() => setName(selfName), [selfName]);

  const saveSelf = async () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== selfName) {
      await api.updateSettings({ self_name: trimmed });
      onChanged();
    }
  };

  const runImport = async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      const s = await api.runImport();
      setImportMsg(`Imported ${s.contactsImported} contacts · placed ${s.placed} · ${s.archivedHidden} hidden`);
      onChanged();
    } catch (e) {
      setImportMsg(`Import failed: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar-self">
        <label>You</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveSelf}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label="Your name"
        />
      </div>

      <h1>Relationship Map</h1>

      <div className="toolbar-actions">
        {importMsg && <span className="import-msg">{importMsg}</span>}
        <button
          className="ghost"
          disabled={!liveMode || importing}
          title={
            liveMode
              ? "Import contacts and interaction history from WhatsApp, iMessage, Mail and Contacts"
              : "Switch to the live map to import"
          }
          onClick={runImport}
        >
          {importing ? "Importing…" : "Import contacts"}
        </button>
        <button
          className="primary"
          disabled={!liveMode || categories.length === 0}
          title={liveMode ? "Add a person" : "Switch to the live map to add people"}
          onClick={() => setAdding(true)}
        >
          + Add person
        </button>
      </div>

      {adding && (
        <AddPersonDialog
          categories={categories}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}
    </header>
  );
}

function AddPersonDialog({
  categories,
  onClose,
  onAdded,
}: {
  categories: Category[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 0);
  const [frequency, setFrequency] = useState<ContactFrequency>("weekly");
  const [rating, setRating] = useState(5);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await api.createPerson({
        name: name.trim(),
        category_id: categoryId,
        contact_frequency: frequency,
        rating,
      });
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add person"
      >
        <h2>Add a person</h2>
        <label>
          Name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Group
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Contact frequency
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as ContactFrequency)}
          >
            {CONTACT_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
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
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!name.trim()} onClick={submit}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
