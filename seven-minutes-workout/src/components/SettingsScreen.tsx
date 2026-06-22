import { useState } from "react";
import type { Gender, Settings } from "../storage/progress";
import { ExerciseFigure } from "../figures/ExerciseFigure";
import { disableReminders, enableReminders, pushSupported } from "../push/subscribe";

export function SettingsScreen({
  settings,
  onSave,
  onBack,
}: {
  settings: Settings;
  onSave: (next: Settings) => Promise<void>;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const update = (patch: Partial<Settings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    void onSave(next);
  };

  const setGender = (gender: Gender) => update({ gender });

  const toggleReminders = async (enabled: boolean) => {
    setMessage(null);
    if (!enabled) {
      update({ remindersEnabled: false });
      await disableReminders().catch(() => {});
      return;
    }
    setBusy(true);
    try {
      await enableReminders(draft.reminderTime);
      update({ remindersEnabled: true });
      setMessage("Erinnerungen aktiviert ✅");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Aktivierung fehlgeschlagen.");
      update({ remindersEnabled: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen settings">
      <header className="settings__header">
        <button className="icon-btn" onClick={onBack} aria-label="Zurück">
          ←
        </button>
        <h1 className="settings__title">Einstellungen</h1>
      </header>

      <section className="card">
        <h2 className="card__title">Figur</h2>
        <p className="card__hint">
          Wähle die Darstellung. Animationen folgen — die Auswahl wird schon
          gespeichert.
        </p>
        <div className="gender-grid">
          {(["male", "female"] as Gender[]).map((g) => (
            <button
              key={g}
              className={`gender-option ${draft.gender === g ? "is-selected" : ""}`}
              onClick={() => setGender(g)}
            >
              <ExerciseFigure
                gender={g}
                exerciseId="squats"
                emoji={g === "male" ? "🧍‍♂️" : "🧍‍♀️"}
                active={false}
              />
              <span>{g === "male" ? "Männlich" : "Weiblich"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">Erinnerungen</h2>
        <p className="card__hint">
          Tägliche Push-Benachrichtigung — funktioniert auch, wenn die App
          geschlossen ist.
        </p>
        <label className="row">
          <span>Tägliche Erinnerung</span>
          <input
            type="checkbox"
            checked={draft.remindersEnabled}
            disabled={busy || !pushSupported()}
            onChange={(e) => void toggleReminders(e.target.checked)}
          />
        </label>
        <label className="row">
          <span>Uhrzeit</span>
          <input
            type="time"
            value={draft.reminderTime}
            onChange={(e) => update({ reminderTime: e.target.value })}
          />
        </label>
        {!pushSupported() && (
          <p className="card__warn">
            Push wird auf diesem Gerät/Browser nicht unterstützt.
          </p>
        )}
        {message && <p className="card__warn">{message}</p>}
      </section>

      <section className="card">
        <h2 className="card__title">Ton</h2>
        <label className="row">
          <span>Signaltöne während des Workouts</span>
          <input
            type="checkbox"
            checked={draft.soundEnabled}
            onChange={(e) => update({ soundEnabled: e.target.checked })}
          />
        </label>
      </section>
    </div>
  );
}
