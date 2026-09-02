import { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { dayLabel, timeRangeLabel } from '../lib/dates.ts';
import type { PlannerEvent } from '../lib/types.ts';
import { Sheet } from './Sheet.tsx';
import { QuickAddSheet } from './QuickAddSheet.tsx';

/**
 * Detail view of one entry. A manual entry can be edited or deleted; an
 * imported one keeps its calendar as the source of truth, so the only things
 * that can be changed here are who it belongs to and whether it shows at all.
 */
export function EventSheet({ event, onClose }: { event: PlannerEvent; onClose: () => void }) {
  const { canEdit, people, family, deleteEvent, setAssignment } = useApp();
  const tz = family?.timezone ?? 'Europe/Zurich';
  const timeFormat = family?.timeFormat ?? '24h';
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assigned, setAssigned] = useState<string[]>(event.personIds);

  if (editing && event.source === 'manual') {
    return <QuickAddSheet existing={event} onClose={() => { setEditing(false); onClose(); }} />;
  }

  const when = event.startDate === event.endDate
    ? dayLabel(event.startDate)
    : `${dayLabel(event.startDate)} – ${dayLabel(event.endDate)}`;
  const time = event.allDay ? 'ganztägig' : timeRangeLabel(event.startsAt, event.endsAt, tz, timeFormat);

  async function onDelete() {
    if (!event.id) return;
    setBusy(true);
    const ok = await deleteEvent(event.id);
    setBusy(false);
    if (ok) onClose();
  }

  async function saveAssignment(personIds: string[], hidden: boolean) {
    setBusy(true);
    const ok = await setAssignment(event, personIds, hidden);
    setBusy(false);
    if (ok) onClose();
  }

  function toggle(id: string) {
    setAssigned(prev => (prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]));
  }

  return (
    <Sheet title={event.title} onClose={onClose}>
      <dl className="detail">
        <dt>Wann</dt><dd>{when} · {time}</dd>
        <dt>Wer</dt>
        <dd>
          {event.personIds.length
            ? people.filter(p => event.personIds.includes(p.id)).map(p => p.name).join(', ')
            : 'Familie'}
          {event.source === 'calendar' && event.autoAssigned && (
            <span className="hint"> · automatisch aus dem Namen erkannt</span>
          )}
        </dd>
        <dt>Quelle</dt>
        <dd>{event.source === 'manual' ? 'Selbst eingetragen' : `Kalender „${event.calendarLabel}“`}</dd>
        {event.notes && (<><dt>Notiz</dt><dd className="pre">{event.notes}</dd></>)}
      </dl>

      {canEdit && event.source === 'manual' && (
        <div className="sheet-actions">
          <button className="btn btn-danger" onClick={onDelete} disabled={busy}>Löschen</button>
          <button className="btn" onClick={() => setEditing(true)} disabled={busy}>Bearbeiten</button>
        </div>
      )}

      {canEdit && event.source === 'calendar' && (
        <>
          <h3>Zuordnung ändern</h3>
          <p className="hint">
            Gilt nur für diesen Termin — der Kalender selbst wird nicht verändert.
          </p>
          <div className="chips-row">
            {people.map(p => (
              <button type="button" key={p.id}
                className={`person-chip${assigned.includes(p.id) ? ' selected' : ''}`}
                style={assigned.includes(p.id) ? { borderColor: p.color, background: p.color } : undefined}
                onClick={() => toggle(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
          <div className="sheet-actions">
            <button className="btn btn-secondary" onClick={() => saveAssignment([], true)} disabled={busy}>
              Im Planer ausblenden
            </button>
            <button className="btn" onClick={() => saveAssignment(assigned, false)} disabled={busy}>
              Zuordnung speichern
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
