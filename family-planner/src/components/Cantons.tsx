import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { todayKey } from '../lib/dates.ts';
import {
  CANTONS, cantonName, cantonState, durationLabel, nextTrip, progress, sortTrips, tripDates,
  tripsOf,
} from '../lib/cantons.ts';
import type { CantonState } from '../lib/cantons.ts';
import type { Trip, TripIdea } from '../lib/types.ts';
import type { NewTripInput } from '../context/AppContext.tsx';
import { Sheet } from './Sheet.tsx';

type Filter = 'alle' | 'offen' | 'geplant' | 'besucht';

const STATE_LABEL: Record<CantonState, string> = {
  besucht: 'besucht', geplant: 'geplant', offen: 'offen',
};

/** All 26 cantons, once, with the children — and where the family stands. */
export function Cantons({ onClose }: { onClose: () => void }) {
  const { family, trips, canEdit } = useApp();
  const tz = family?.timezone ?? 'Europe/Zurich';
  const today = todayKey(tz);

  const [filter, setFilter] = useState<Filter>('alle');
  const [open, setOpen] = useState<string | null>(null);

  const done = progress(trips);
  const next = nextTrip(trips, today);
  const shown = CANTONS.filter(c => filter === 'alle' || cantonState(trips, c.code) === filter);

  return (
    <div className="cx-screen">
      <header className="topbar no-print">
        <div className="topbar-left">
          <button className="icon-btn" aria-label="Zurück zum Plan" onClick={onClose}>‹</button>
          <h1>Kantone</h1>
        </div>
      </header>

      <main className="cx-body">
        <div className="cx-progress">
          <p className="cx-count">
            <b>{done.visited}</b> von {done.total} Kantonen
            {done.planned > 0 && <span className="muted"> · {done.planned} geplant</span>}
          </p>
          <div className="cx-bar" role="img"
            aria-label={`${done.visited} von ${done.total} Kantonen besucht`}>
            <i className="cx-bar-done" style={{ flexGrow: done.visited }} />
            <i className="cx-bar-planned" style={{ flexGrow: done.planned }} />
            <i style={{ flexGrow: done.total - done.visited - done.planned }} />
          </div>
          {next && (
            <p className="hint">
              Als Nächstes: <b>{cantonName(next.canton)}</b> — {next.title}, {tripDates(next)}
            </p>
          )}
        </div>

        <div className="cx-chips">
          {(['alle', 'offen', 'geplant', 'besucht'] as Filter[]).map(f => (
            <button key={f} className="hh-chip" aria-pressed={filter === f}
              onClick={() => setFilter(f)}>
              {f === 'alle' ? 'Alle' : STATE_LABEL[f].charAt(0).toUpperCase() + STATE_LABEL[f].slice(1)}
            </button>
          ))}
        </div>

        <ul className="hh-list">
          {shown.map(canton => {
            const state = cantonState(trips, canton.code);
            const mine = sortTrips(tripsOf(trips, canton.code));
            return (
              <li key={canton.code} className={`hh-row cx-row is-${state}`}>
                <button className="hh-main cx-main" onClick={() => setOpen(canton.code)}>
                  <span className="cx-code" aria-hidden="true">{canton.code}</span>
                  <span className="grow">
                    <span className="hh-name">{canton.name}</span>
                    {mine.length > 0 && (
                      <span className="hh-meta">
                        {mine.map(t => `${t.title}${t.fromDate || t.done ? ` (${tripDates(t)})` : ''}`).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className={`cx-state is-${state}`}>
                    {state === 'besucht' ? '✓' : state === 'geplant' ? '•' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {!shown.length && <p className="hint">In dieser Gruppe ist gerade nichts.</p>}

        {!canEdit && (
          <p className="hint">Ausflüge eintragen dürfen Owner und Bearbeiter.</p>
        )}
      </main>

      {open && <CantonSheet canton={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- canton */

function CantonSheet({ canton, onClose }: { canton: string; onClose: () => void }) {
  const { trips, tripIdeas, canEdit, updateTrip, deleteTrip } = useApp();
  const [editing, setEditing] = useState<Trip | 'neu' | null>(null);

  const mine = sortTrips(tripsOf(trips, canton));
  const ideas = tripIdeas.filter(i => i.canton === canton);

  return (
    <Sheet title={cantonName(canton)} onClose={onClose}>
      <h3>Ausflüge</h3>
      {mine.length ? (
        <ul className="settings-list cx-trips">
          {mine.map(trip => (
            <li key={trip.id}>
              <label className="hh-doer">
                <input type="checkbox" checked={trip.done} disabled={!canEdit}
                  aria-label={`${trip.title} als besucht markieren`}
                  onChange={e => updateTrip(trip.id, { done: e.target.checked })} />
                <span className="grow">
                  <b className={trip.done ? 'cx-done' : ''}>{trip.title}</b>
                  <span className="hint">
                    {tripDates(trip)}
                    {trip.source === 'idee' && ' · aus einer Idee'}
                  </span>
                  {trip.notes && <span className="hint cx-notes">{trip.notes}</span>}
                </span>
              </label>
              {canEdit && (
                <span className="row">
                  <button className="linklike" onClick={() => setEditing(trip)}>Ändern</button>
                  <button className="linklike danger" onClick={() => deleteTrip(trip.id)}>Löschen</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Für {cantonName(canton)} steht noch nichts.</p>
      )}

      {canEdit && editing === null && (
        <p className="add-note">
          <button className="btn" onClick={() => setEditing('neu')}>Ausflug eintragen</button>
        </p>
      )}
      {canEdit && editing !== null && (
        <TripForm canton={canton} trip={editing === 'neu' ? null : editing}
          onDone={() => setEditing(null)} />
      )}

      <Ideas canton={canton} ideas={ideas} />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ form */

const emptyTrip = (canton: string): NewTripInput => ({
  canton, title: '', notes: '', fromDate: null, toDate: null,
  done: false, doneOn: null, source: 'eigen',
});

function TripForm({ canton, trip, onDone }: {
  canton: string; trip: Trip | null; onDone: () => void;
}) {
  const { addTrip, updateTrip, addEvent } = useApp();
  const [draft, setDraft] = useState<NewTripInput>(() => (trip ? { ...trip } : emptyTrip(canton)));
  const [overnight, setOvernight] = useState(Boolean(trip?.toDate));
  const [toPlanner, setToPlanner] = useState(false);
  const [busy, setBusy] = useState(false);

  const patch = (p: Partial<NewTripInput>) => setDraft(d => ({ ...d, ...p }));

  async function save() {
    if (!draft.title.trim()) return;
    setBusy(true);
    const next = { ...draft, toDate: overnight ? draft.toDate : null };
    const ok = trip ? await updateTrip(trip.id, next) : await addTrip(next);
    // The planner is the point of the app, so a trip with a date can land in
    // the week without being typed a second time.
    if (ok && toPlanner && next.fromDate) {
      await addEvent({
        title: `${cantonName(canton)}: ${next.title.trim()}`,
        notes: next.notes,
        allDay: true,
        startDate: next.fromDate,
        endDate: next.toDate ?? next.fromDate,
        personIds: [],
      });
    }
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <div className="stack cx-form">
      <label htmlFor="cx-title">Was habt ihr vor?</label>
      <input id="cx-title" type="text" value={draft.title} placeholder="z. B. Rheinfall"
        onChange={e => patch({ title: e.target.value })} />

      <div className="row">
        <label className="grow" htmlFor="cx-from">Datum <span className="muted">(optional)</span></label>
      </div>
      <div className="row">
        <input id="cx-from" type="date" value={draft.fromDate ?? ''}
          onChange={e => patch({ fromDate: e.target.value || null })} />
        {overnight && (
          <>
            <span className="row-sep">bis</span>
            <input type="date" value={draft.toDate ?? ''} aria-label="bis"
              min={draft.fromDate ?? undefined}
              onChange={e => patch({ toDate: e.target.value || null })} />
          </>
        )}
      </div>
      <label className="hh-switch">
        <input type="checkbox" checked={overnight}
          onChange={e => {
            setOvernight(e.target.checked);
            if (!e.target.checked) patch({ toDate: null });
          }} />
        <span>
          <span className="hh-switch-title">Mit Übernachtung</span>
          <span className="hh-switch-note">Zwei Tage statt einem — dann braucht es ein Enddatum.</span>
        </span>
      </label>

      <label htmlFor="cx-notes">Notiz <span className="muted">(optional)</span></label>
      <textarea id="cx-notes" rows={3} value={draft.notes}
        onChange={e => patch({ notes: e.target.value })} />

      <label className="hh-switch">
        <input type="checkbox" checked={draft.done}
          onChange={e => patch({ done: e.target.checked })} />
        <span>
          <span className="hh-switch-title">Schon gewesen</span>
          <span className="hh-switch-note">Hakt den Kanton ab. Ohne Datum zählt der heutige Tag.</span>
        </span>
      </label>

      {!trip && draft.fromDate && !draft.done && (
        <label className="hh-switch">
          <input type="checkbox" checked={toPlanner} onChange={e => setToPlanner(e.target.checked)} />
          <span>
            <span className="hh-switch-title">Im Wochenplan eintragen</span>
            <span className="hh-switch-note">Legt den Ausflug als ganztägigen Eintrag in der Spalte „Familie“ an.</span>
          </span>
        </label>
      )}

      <div className="sheet-actions">
        <button className="btn btn-secondary" onClick={onDone}>Abbrechen</button>
        <button className="btn" disabled={busy || !draft.title.trim()} onClick={save}>Speichern</button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- ideas */

/**
 * What the model suggested, as proposals rather than facts.
 *
 * It is one model answering out of what it knows — no web search, no live
 * opening hours — so the note under the list says so. Taking one over writes
 * an ordinary trip; nothing here ends up in the plan on its own.
 */
function Ideas({ canton, ideas }: { canton: string; ideas: TripIdea[] }) {
  const { canEdit, family, addTrip, fetchTripIdeas, discardTripIdea, sync } = useApp();
  const [wishes, setWishes] = useState(() => ideas[0]?.wishes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const generatedAt = useMemo(() => {
    const iso = ideas[0]?.generatedAt;
    if (!iso) return null;
    const [, m, d] = iso.slice(0, 10).split('-').map(Number);
    return `${d}.${m}.`;
  }, [ideas]);

  async function ask(refresh: boolean) {
    setBusy(true);
    setError(null);
    const message = await fetchTripIdeas(canton, wishes, refresh);
    setBusy(false);
    setError(message);
  }

  async function take(idea: TripIdea) {
    const notes = [idea.summary, idea.highlights.join(' · '), idea.travel]
      .map(s => s.trim()).filter(Boolean).join('\n');
    const ok = await addTrip({
      canton, title: idea.title, notes,
      fromDate: null, toDate: null, done: false, doneOn: null, source: 'idee',
    });
    if (ok) discardTripIdea(idea.id);
  }

  if (!canEdit) return null;
  const working = busy || sync.busy;

  return (
    <>
      <h3>Ideen</h3>
      {!ideas.length && (
        <p className="hint">
          Claude schlägt Tages- und Zweitagesausflüge in {cantonName(canton)} vor — passend zu
          Kindern, mit Wünschen, wenn ihr welche habt.
        </p>
      )}
      <p className="hint">
        {family?.weatherPlz
          ? <>Fahrzeiten ab <b>{family.weatherPlz}</b>.</>
          : <>Ohne PLZ steht keine Fahrzeit dabei — unter Einstellungen → Anzeige eintragen.</>}
      </p>
      <div className="row cx-ask">
        <input type="text" value={wishes} placeholder="Wünsche, z. B. mit Kinderwagen"
          aria-label="Wünsche" onChange={e => setWishes(e.target.value)} />
        <button className="btn btn-secondary" disabled={working} onClick={() => ask(ideas.length > 0)}>
          {working ? 'Einen Moment …' : ideas.length ? 'Neue Ideen' : 'Ideen holen'}
        </button>
      </div>
      {error && <p className="notice danger">{error}</p>}

      {ideas.length > 0 && (
        <>
          <ul className="cx-ideas">
            {ideas.map(idea => (
              <li key={idea.id} className="cx-idea">
                <div className="cx-idea-head">
                  <b className="grow">{idea.title}</b>
                  <span className="hh-tag">{durationLabel(idea.duration)}</span>
                </div>
                {idea.summary && <p className="cx-idea-text">{idea.summary}</p>}
                {idea.highlights.length > 0 && (
                  <ul className="cx-highlights">
                    {idea.highlights.map(h => <li key={h}>{h}</li>)}
                  </ul>
                )}
                {(idea.season || idea.travel) && (
                  <p className="hint">
                    {[idea.season, idea.travel].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="row">
                  <button className="btn btn-secondary" onClick={() => take(idea)}>
                    Als Ausflug übernehmen
                  </button>
                  <button className="linklike" onClick={() => discardTripIdea(idea.id)}>Verwerfen</button>
                </div>
              </li>
            ))}
          </ul>
          <p className="hint">
            Von Claude vorgeschlagen{generatedAt && ` am ${generatedAt}`} — Öffnungszeiten und
            Preise stehen bewusst nicht dabei, die wollen vor der Fahrt geprüft sein.
          </p>
        </>
      )}
    </>
  );
}
