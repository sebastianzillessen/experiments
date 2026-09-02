import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../context/AppContext.tsx';
import type { NewEventInput } from '../context/AppContext.tsx';
import type { PlannerEvent } from '../lib/types.ts';
import { timeLabel } from '../lib/dates.ts';
import { Sheet } from './Sheet.tsx';

export type QuickAddPrefill = {
  date: string;
  /** null = the shared "Familie" column. */
  personId: string | null;
};

/**
 * The fast path: a title, who it is for, the day — done. All-day is the
 * default because that is how most lines on the paper sheet read; switching
 * to von–bis reveals the two time fields.
 */
export function QuickAddSheet({ prefill, existing, onClose }: {
  prefill?: QuickAddPrefill;
  existing?: PlannerEvent;
  onClose: () => void;
}) {
  const { people, addEvent, updateEvent, family } = useApp();
  const tz = family?.timezone ?? 'Europe/Zurich';

  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? prefill?.date ?? '');
  const [endDate, setEndDate] = useState(existing?.endDate ?? prefill?.date ?? '');
  const [allDay, setAllDay] = useState(existing ? existing.allDay : true);
  const [startTime, setStartTime] = useState(
    existing?.startsAt ? timeLabel(existing.startsAt, tz) : '09:00');
  const [endTime, setEndTime] = useState(
    existing?.endsAt ? timeLabel(existing.endsAt, tz) : '10:00');
  const [selected, setSelected] = useState<string[]>(
    existing ? existing.personIds : (prefill?.personId ? [prefill.personId] : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePerson(id: string) {
    setSelected(prev => (prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]));
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Bitte einen Titel eingeben.');
      return;
    }
    if (!startDate) {
      setError('Bitte ein Datum wählen.');
      return;
    }
    const input: NewEventInput = {
      title,
      notes,
      allDay,
      startDate,
      endDate: endDate || startDate,
      startTime,
      endTime,
      personIds: selected,
    };
    setBusy(true);
    const ok = existing?.id ? await updateEvent(existing.id, input) : await addEvent(input);
    setBusy(false);
    if (ok) onClose();
    else setError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
  }

  return (
    <Sheet title={existing ? 'Eintrag bearbeiten' : 'Neuer Eintrag'} onClose={onClose}>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <label htmlFor="qa-title">Was?</label>
        <input id="qa-title" value={title} autoFocus placeholder="z. B. Zahnarzt Lilly"
          onChange={e => setTitle(e.target.value)} />

        <label>Wer?</label>
        <div className="chips-row">
          {people.map(p => (
            <button type="button" key={p.id}
              className={`person-chip${selected.includes(p.id) ? ' selected' : ''}`}
              style={selected.includes(p.id) ? { borderColor: p.color, background: p.color } : undefined}
              onClick={() => togglePerson(p.id)}>
              {p.name}
            </button>
          ))}
          {people.length === 0 && <span className="hint">Noch keine Personen angelegt.</span>}
        </div>
        <p className="hint">Niemand ausgewählt → Spalte „Familie“.</p>

        <label htmlFor="qa-start">Wann?</label>
        <div className="row">
          <input id="qa-start" type="date" value={startDate}
            onChange={e => { setStartDate(e.target.value); if (!endDate || endDate < e.target.value) setEndDate(e.target.value); }} />
          <span className="row-sep">bis</span>
          <input id="qa-end" type="date" value={endDate} min={startDate}
            onChange={e => setEndDate(e.target.value)} />
        </div>

        <div className="row radios">
          <label><input type="radio" name="qa-mode" checked={allDay} onChange={() => setAllDay(true)} /> ganztägig</label>
          <label><input type="radio" name="qa-mode" checked={!allDay} onChange={() => setAllDay(false)} /> von–bis</label>
        </div>
        {!allDay && (
          <div className="row">
            <input id="qa-start-time" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            <span className="row-sep">–</span>
            <input id="qa-end-time" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
        )}

        <label htmlFor="qa-notes">Notiz (optional)</label>
        <input id="qa-notes" value={notes} onChange={e => setNotes(e.target.value)} />

        {error && <div className="notice danger">{error}</div>}

        <div className="sheet-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn" id="btn-save-event" disabled={busy}>
            {busy ? 'Speichern …' : 'Speichern'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
