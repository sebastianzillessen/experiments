import { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { fmtMinutes, weeklyMinutes } from '../lib/tasks.ts';

/**
 * Who takes on household work, and the one button that fills an empty list.
 *
 * Everyone in the planner has a column in the week, but not everyone empties
 * the dishwasher. The task screen offers a button per person, and a row of
 * buttons is only usable while they are few — so the family says here who
 * belongs on it.
 */
export function HouseholdSettings() {
  const { people, tasks, canEdit, updatePerson, addStarterTasks } = useApp();
  const [busy, setBusy] = useState(false);
  const doers = people.filter(p => p.doesTasks);
  const plannedPerWeek = tasks.filter(t => t.active).reduce((s, t) => s + weeklyMinutes(t), 0);

  if (!canEdit) {
    return <p className="muted">Wer Aufgaben übernimmt, können Owner und Bearbeiter festlegen.</p>;
  }

  return (
    <>
      <h3>Wer übernimmt Aufgaben?</h3>
      <p className="hint">
        Die Ausgewählten stehen unter „Heute“ als Knopf hinter jeder Aufgabe und tauchen in der
        Verteilung auf. Ist niemand ausgewählt, werden alle angeboten.
      </p>
      <ul className="settings-list">
        {people.map(p => (
          <li key={p.id}>
            <label className="hh-doer">
              <input type="checkbox" checked={p.doesTasks}
                onChange={e => updatePerson(p.id, { doesTasks: e.target.checked })} />
              <span className="dot" style={{ background: p.color }} aria-hidden="true" />
              <span className="grow">{p.name}</span>
            </label>
          </li>
        ))}
        {!people.length && <li className="muted">Noch keine Personen angelegt.</li>}
      </ul>
      {!doers.length && (
        <p className="notice info">
          Noch niemand ausgewählt — bis dahin werden alle Personen der Familie angeboten.
        </p>
      )}

      <h3>Aufgaben</h3>
      {tasks.length ? (
        <p className="hint">
          {tasks.length} Aufgaben im Katalog, zusammen <b>{fmtMinutes(plannedPerWeek)}</b> geplante
          Arbeit pro Woche. Bearbeitet werden sie im Haushalts-Bildschirm.
        </p>
      ) : (
        <>
          <p className="hint">
            Der Katalog ist leer. Die üblichen Verdächtigen lassen sich in einem Schritt anlegen
            und danach umbenennen, ändern oder löschen.
          </p>
          <button className="btn" disabled={busy}
            onClick={async () => { setBusy(true); await addStarterTasks(); setBusy(false); }}>
            Übliche Aufgaben übernehmen
          </button>
        </>
      )}
    </>
  );
}
