import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { aliasCandidates, eventText } from '../lib/assign.ts';
import { dayLabel, timeRangeLabel } from '../lib/dates.ts';
import { describeRepeat } from '../lib/recurrence.ts';
import type { PlannerEvent } from '../lib/types.ts';
import type { EditScope } from '../context/AppContext.tsx';
import { Sheet } from './Sheet.tsx';
import { QuickAddSheet } from './QuickAddSheet.tsx';

/**
 * Detail view of one entry. A manual entry can be edited or deleted; an
 * imported one keeps its calendar as the source of truth, so the only things
 * that can be changed here are who it belongs to and whether it shows at all.
 */
export function EventSheet({ event, onClose }: { event: PlannerEvent; onClose: () => void }) {
  const { canEdit, people, family, deleteEvent, setAssignment, updatePerson } = useApp();
  const tz = family?.timezone ?? 'Europe/Zurich';
  const timeFormat = family?.timeFormat ?? '24h';
  const [editing, setEditing] = useState<EditScope | null>(null);
  const [busy, setBusy] = useState(false);
  const [assigned, setAssigned] = useState<string[]>(event.personIds);
  const [aliasAdded, setAliasAdded] = useState<string | null>(null);

  // Only one person can own a new spelling, so the offer appears once the
  // choice is unambiguous.
  const aliasTarget = assigned.length === 1 ? people.find(p => p.id === assigned[0]) ?? null : null;
  const candidates = useMemo(
    () => aliasCandidates(eventText({ title: event.title, location: '', description: '' }), people),
    [event.title, people]
  );

  if (editing && event.source === 'manual') {
    return (
      <QuickAddSheet existing={event} scope={editing}
        onClose={() => { setEditing(null); onClose(); }} />
    );
  }

  const when = event.startDate === event.endDate
    ? dayLabel(event.startDate)
    : `${dayLabel(event.startDate)} – ${dayLabel(event.endDate)}`;
  const time = event.allDay ? 'ganztägig' : timeRangeLabel(event.startsAt, event.endsAt, tz, timeFormat);

  async function onDelete(scope: EditScope) {
    if (!event.id) return;
    setBusy(true);
    const ok = await deleteEvent(event.id, scope, event.occurrence);
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
        {event.repeat && (<><dt>Serie</dt><dd>{describeRepeat(event.repeat)}</dd></>)}
        {event.notes && (<><dt>Notiz</dt><dd className="pre">{event.notes}</dd></>)}
      </dl>

      {canEdit && event.source === 'manual' && !event.repeat && (
        <div className="sheet-actions">
          <button className="btn btn-danger" onClick={() => onDelete('series')} disabled={busy}>Löschen</button>
          <button className="btn" onClick={() => setEditing('series')} disabled={busy}>Bearbeiten</button>
        </div>
      )}

      {canEdit && event.source === 'manual' && event.repeat && (
        // Ein Termin aus einer Serie: die Frage ist nicht ob, sondern wie weit.
        <div className="scope-actions">
          <p className="hint">Dieser Eintrag gehört zu einer Serie.</p>
          <div className="scope-row">
            <span className="scope-label">Bearbeiten</span>
            <button className="btn btn-secondary" disabled={busy}
              onClick={() => setEditing('occurrence')}>Nur diesen Termin</button>
            <button className="btn btn-secondary" disabled={busy}
              onClick={() => setEditing('series')}>Alle Termine</button>
          </div>
          <div className="scope-row">
            <span className="scope-label">Löschen</span>
            <button className="btn btn-danger" disabled={busy}
              onClick={() => onDelete('occurrence')}>Nur diesen Termin</button>
            <button className="btn btn-danger" disabled={busy}
              onClick={() => onDelete('series')}>Alle Termine</button>
          </div>
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
          {aliasTarget && candidates.length > 0 && (
            <div className="alias-offer">
              <p className="hint">
                Welches Wort steht künftig für {aliasTarget.name}? Termine mit diesem Wort landen
                dann automatisch in dieser Spalte.
              </p>
              <div className="chips-row">
                {candidates.map(word => (
                  <button type="button" key={word} className="person-chip" disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const ok = await updatePerson(aliasTarget.id, {
                        aliases: [...aliasTarget.aliases, word],
                      });
                      setBusy(false);
                      if (ok) setAliasAdded(word);
                    }}>
                    {word}
                  </button>
                ))}
              </div>
              {aliasAdded && (
                <div className="notice success">
                  „{aliasAdded}“ zählt jetzt als {aliasTarget.name}.
                </div>
              )}
            </div>
          )}

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
