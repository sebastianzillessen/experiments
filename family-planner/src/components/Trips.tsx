import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { todayKey } from '../lib/dates.ts';
import {
  STARTERS, destinationState, durationLabel, groupsOf, inGroup, nextTrip, progress, sortTrips,
  tripDates, tripsOf,
} from '../lib/destinations.ts';
import type { DestinationState } from '../lib/destinations.ts';
import type { Destination, DestinationDraft, GeneratedList, Trip, TripIdea } from '../lib/types.ts';
import type { NewTripInput } from '../context/AppContext.tsx';
import { Sheet } from './Sheet.tsx';

type Filter = 'alle' | 'offen' | 'geplant' | 'besucht';

const FILTER_LABEL: Record<Filter, string> = {
  alle: 'Alle', offen: 'Offen', geplant: 'Geplant', besucht: 'Besucht',
};

/**
 * Places the family wants to get through, and what it has made of them.
 *
 * The list belongs to the family — cantons for one, countries for the next —
 * so everything here works off fp_destinations rather than a constant. Which
 * destination is open comes from the address, so it can be sent as a link.
 */
export function Trips({ destination: openId, onDestination, onClose }: {
  destination: string | null;
  onDestination: (id: string | null) => void;
  onClose: () => void;
}) {
  const { family, destinations, trips, canEdit } = useApp();
  const tz = family?.timezone ?? 'Europe/Zurich';
  const today = todayKey(tz);

  const [filter, setFilter] = useState<Filter>('alle');
  const [group, setGroup] = useState<string | null>(null);
  const [adding, setAdding] = useState<'ziel' | 'liste' | null>(null);

  const groups = groupsOf(destinations);
  // A group can disappear under a viewer — the first one is always there.
  const activeGroup = group && groups.includes(group) ? group : groups[0] ?? null;
  const ofGroup = inGroup(destinations, activeGroup);

  const done = progress(ofGroup, trips);
  const next = nextTrip(trips, today);
  const nextPlace = next && destinations.find(d => d.id === next.destinationId);
  const shown = ofGroup.filter(d => filter === 'alle' || destinationState(trips, d.id) === filter);
  const open = destinations.find(d => d.id === openId) ?? null;

  return (
    <div className="tr-screen">
      <header className="topbar no-print">
        <div className="topbar-left">
          <button className="icon-btn" aria-label="Zurück zum Plan" onClick={onClose}>‹</button>
          <h1>Ausflüge</h1>
        </div>
      </header>

      <main className="tr-body">
        {!destinations.length ? (
          <Starters />
        ) : (
          <>
            {groups.length > 1 && (
              <div className="tr-chips" role="tablist" aria-label="Liste">
                {groups.map(g => (
                  <button key={g} role="tab" className="hh-chip" aria-selected={g === activeGroup}
                    aria-pressed={g === activeGroup} onClick={() => setGroup(g)}>{g}</button>
                ))}
              </div>
            )}

            <div className="tr-progress">
              <p className="tr-count">
                <b>{done.visited}</b> von {done.total}
                {activeGroup && <span className="muted"> · {activeGroup}</span>}
                {done.planned > 0 && <span className="muted"> · {done.planned} geplant</span>}
              </p>
              <div className="tr-bar" role="img"
                aria-label={`${done.visited} von ${done.total} besucht`}>
                <i className="tr-bar-done" style={{ flexGrow: done.visited }} />
                <i className="tr-bar-planned" style={{ flexGrow: done.planned }} />
                <i style={{ flexGrow: Math.max(0, done.total - done.visited - done.planned) }} />
              </div>
              {next && nextPlace && (
                <p className="hint">
                  Als Nächstes: <b>{nextPlace.name}</b> — {next.title}, {tripDates(next)}
                </p>
              )}
            </div>

            <div className="tr-chips">
              {(['alle', 'offen', 'geplant', 'besucht'] as Filter[]).map(f => (
                <button key={f} className="hh-chip" aria-pressed={filter === f}
                  onClick={() => setFilter(f)}>{FILTER_LABEL[f]}</button>
              ))}
            </div>

            <ul className="hh-list">
              {shown.map(place => (
                <DestinationRow key={place.id} place={place} trips={trips}
                  onOpen={() => onDestination(place.id)} />
              ))}
            </ul>
            {!shown.length && <p className="hint">In dieser Gruppe ist gerade nichts.</p>}

            {canEdit && (adding === 'ziel' ? (
              <DestinationForm group={activeGroup ?? 'Ziele'} onDone={() => setAdding(null)} />
            ) : adding === 'liste' ? (
              <ListGenerator onDone={() => setAdding(null)} />
            ) : (
              <p className="add-note row">
                <button className="btn btn-secondary" onClick={() => setAdding('ziel')}>
                  Ziel hinzufügen
                </button>
                <button className="btn btn-secondary" onClick={() => setAdding('liste')}>
                  Liste erzeugen
                </button>
              </p>
            ))}
          </>
        )}

        {!canEdit && <p className="hint">Ausflüge eintragen dürfen Owner und Bearbeiter.</p>}
      </main>

      {open && <DestinationSheet place={open} onClose={() => onDestination(null)} />}
    </div>
  );
}

function DestinationRow({ place, trips, onOpen }: {
  place: Destination; trips: Trip[]; onOpen: () => void;
}) {
  const state: DestinationState = destinationState(trips, place.id);
  const mine = sortTrips(tripsOf(trips, place.id));
  return (
    <li className={`hh-row tr-row is-${state}`}>
      <button className="hh-main tr-main" onClick={onOpen}>
        {place.code && <span className="tr-code" aria-hidden="true">{place.code}</span>}
        <span className="grow">
          <span className="hh-name">{place.name}</span>
          {mine.length > 0 && (
            <span className="hh-meta">
              {mine.map(t => `${t.title}${t.fromDate || t.done ? ` (${tripDates(t)})` : ''}`).join(' · ')}
            </span>
          )}
        </span>
        <span className={`tr-state is-${state}`}>
          {state === 'besucht' ? '✓' : state === 'geplant' ? '•' : ''}
        </span>
      </button>
    </li>
  );
}

/* -------------------------------------------------------------- starters */

/** Nothing on the list yet: take a ready-made one, or write your own. */
function Starters() {
  const { canEdit, addStarterDestinations } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [own, setOwn] = useState(false);

  return (
    <div className="tr-empty">
      <h2>Wohin wollt ihr?</h2>
      <p className="muted">
        Eine Liste von Zielen, die ihr abarbeiten wollt — alle Kantone, alle Länder Europas, oder
        etwas ganz Eigenes. Für jedes Ziel tragt ihr Ausflüge ein und hakt sie ab.
      </p>
      {canEdit && (
        <>
          <ul className="tr-starters">
            {STARTERS.map(starter => (
              <li key={starter.id}>
                <div className="grow">
                  <b>{starter.label}</b>
                  <span className="hint">{starter.note}</span>
                </div>
                <button className="btn btn-secondary" disabled={busy !== null}
                  onClick={async () => {
                    setBusy(starter.id);
                    await addStarterDestinations(starter.id);
                    setBusy(null);
                  }}>
                  {busy === starter.id ? 'Einen Moment …' : 'Übernehmen'}
                </button>
              </li>
            ))}
          </ul>
          <h3>Oder eine Liste erzeugen</h3>
          <ListGenerator onDone={() => {}} />
          {own
            ? <DestinationForm group="Ziele" onDone={() => setOwn(false)} />
            : <p className="add-note">
                <button className="btn btn-secondary" onClick={() => setOwn(true)}>Einzelnes Ziel</button>
              </p>}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- generator */

/** Descriptions worth not typing out. They fill the field, nothing more. */
const EXAMPLES = [
  'Kantone der Schweiz',
  'Bundesländer in Deutschland',
  'Länder Europas',
  'Hauptstädte in Europa',
  'Die grössten Städte Europas',
  'Nationalparks in Italien',
];

/**
 * "Hauptstädte in Europa" → a list to tick off.
 *
 * The model proposes and the family confirms, the same bargain the trip ideas
 * and the pasted dates strike: everything it came back with is shown, ticked,
 * and can be unticked before a single row is written. Nothing is saved until
 * somebody has looked at it.
 */
function ListGenerator({ onDone }: { onDone: () => void }) {
  const { generateDestinationList, addDestinations, sync } = useApp();
  const [request, setRequest] = useState('');
  const [list, setList] = useState<GeneratedList | null>(null);
  const [group, setGroup] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    const answer = await generateDestinationList(request);
    setBusy(false);
    if (answer.error || !answer.list) {
      setError(answer.error ?? 'Die Liste konnte nicht erzeugt werden');
      return;
    }
    setList(answer.list);
    setGroup(answer.list.group);
    setPicked(new Set(answer.list.items.map(i => i.name)));
  }

  async function take() {
    if (!list) return;
    setBusy(true);
    const items: DestinationDraft[] = list.items.filter(i => picked.has(i.name));
    const added = await addDestinations(group, items);
    setBusy(false);
    setList(null);
    setRequest('');
    if (added > 0) onDone();
  }

  const working = busy || sync.busy;

  if (list) {
    return (
      <div className="stack tr-form">
        <label htmlFor="tr-list-group">Name der Liste</label>
        <input id="tr-list-group" type="text" value={group} maxLength={60}
          onChange={e => setGroup(e.target.value)} />
        {list.note && <p className="hint">{list.note}</p>}

        <p className="hint">{picked.size} von {list.items.length} ausgewählt</p>
        <ul className="settings-list tr-picks">
          {list.items.map(item => (
            <li key={item.name}>
              <label className="hh-doer">
                <input type="checkbox" checked={picked.has(item.name)}
                  onChange={e => setPicked(p => {
                    const next = new Set(p);
                    if (e.target.checked) next.add(item.name); else next.delete(item.name);
                    return next;
                  })} />
                <span className="grow">
                  {item.code && <span className="tr-code">{item.code}</span>}
                  {' '}{item.name}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="hint">
          Von Claude erzeugt — was fehlt oder zu viel ist, lässt sich hier und später ändern.
        </p>

        <div className="sheet-actions">
          <button className="btn btn-secondary" onClick={() => setList(null)}>Verwerfen</button>
          <button className="btn" disabled={working || !picked.size} onClick={take}>
            {picked.size} Ziele übernehmen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack tr-form">
      <label htmlFor="tr-request">Was für eine Liste?</label>
      <div className="tr-chips">
        {EXAMPLES.map(example => (
          <button key={example} className="hh-chip" onClick={() => setRequest(example)}>
            {example}
          </button>
        ))}
      </div>
      <div className="row tr-ask">
        <input id="tr-request" type="text" value={request} maxLength={200}
          placeholder="z. B. Hauptstädte in Europa"
          onChange={e => { setRequest(e.target.value); setError(null); }} />
        <button className="btn" disabled={working || request.trim().length < 3} onClick={generate}>
          {working ? 'Einen Moment …' : 'Erzeugen'}
        </button>
      </div>
      {error && <p className="notice danger">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------ destination */

function DestinationForm({ group, place, onDone }: {
  group: string; place?: Destination; onDone: () => void;
}) {
  const { destinations, addDestination, updateDestination } = useApp();
  const [name, setName] = useState(place?.name ?? '');
  const [code, setCode] = useState(place?.code ?? '');
  const [list, setList] = useState(place?.group ?? group);
  const [busy, setBusy] = useState(false);
  const groups = groupsOf(destinations);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    const input = { name, code: code.trim() || null, group: list };
    const ok = place ? await updateDestination(place.id, input) : await addDestination(input);
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <div className="stack tr-form">
      <label htmlFor="tr-name">Ziel</label>
      <input id="tr-name" type="text" value={name} placeholder="z. B. Graubünden, Toskana, Elsass"
        maxLength={80} onChange={e => setName(e.target.value)} />

      <div className="row">
        <span className="grow">
          <label htmlFor="tr-code">Kürzel <span className="muted">(optional)</span></label>
          <input id="tr-code" type="text" value={code} placeholder="GR" maxLength={4}
            onChange={e => setCode(e.target.value)} />
        </span>
        <span className="grow">
          <label htmlFor="tr-group">Liste</label>
          <input id="tr-group" type="text" value={list} list="tr-groups" maxLength={60}
            onChange={e => setList(e.target.value)} />
          <datalist id="tr-groups">
            {groups.map(g => <option key={g} value={g} />)}
          </datalist>
        </span>
      </div>
      <p className="hint">Gleiche Liste, gleicher Fortschrittsbalken.</p>

      <div className="sheet-actions">
        <button className="btn btn-secondary" onClick={onDone}>Abbrechen</button>
        <button className="btn" disabled={busy || !name.trim()} onClick={save}>Speichern</button>
      </div>
    </div>
  );
}

function DestinationSheet({ place, onClose }: { place: Destination; onClose: () => void }) {
  const { trips, tripIdeas, canEdit, updateTrip, deleteTrip, deleteDestination } = useApp();
  const [editing, setEditing] = useState<Trip | 'neu' | null>(null);
  const [renaming, setRenaming] = useState(false);

  const mine = sortTrips(tripsOf(trips, place.id));
  const ideas = tripIdeas.filter(i => i.destinationId === place.id);

  return (
    <Sheet title={place.name} onClose={onClose}>
      {renaming ? (
        <DestinationForm group={place.group} place={place} onDone={() => setRenaming(false)} />
      ) : (
        <>
          <h3>Ausflüge</h3>
          {mine.length ? (
            <ul className="settings-list tr-trips">
              {mine.map(trip => (
                <li key={trip.id}>
                  <label className="hh-doer">
                    <input type="checkbox" checked={trip.done} disabled={!canEdit}
                      aria-label={`${trip.title} als besucht markieren`}
                      onChange={e => updateTrip(trip.id, { done: e.target.checked })} />
                    <span className="grow">
                      <b className={trip.done ? 'tr-done' : ''}>{trip.title}</b>
                      <span className="hint">
                        {tripDates(trip)}
                        {trip.source === 'idee' && ' · aus einer Idee'}
                      </span>
                      {trip.notes && <span className="hint tr-notes">{trip.notes}</span>}
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
            <p className="hint">Für {place.name} steht noch nichts.</p>
          )}

          {canEdit && editing === null && (
            <p className="add-note">
              <button className="btn" onClick={() => setEditing('neu')}>Ausflug eintragen</button>
            </p>
          )}
          {canEdit && editing !== null && (
            <TripForm place={place} trip={editing === 'neu' ? null : editing}
              onDone={() => setEditing(null)} />
          )}

          <Ideas place={place} ideas={ideas} />

          {canEdit && (
            <p className="tr-foot">
              <button className="linklike" onClick={() => setRenaming(true)}>Ziel bearbeiten</button>
              <button className="linklike danger"
                onClick={async () => { if (await deleteDestination(place.id)) onClose(); }}>
                Ziel entfernen
              </button>
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ trip */

const emptyTrip = (destinationId: string): NewTripInput => ({
  destinationId, title: '', notes: '', fromDate: null, toDate: null,
  done: false, doneOn: null, source: 'eigen',
});

function TripForm({ place, trip, onDone }: {
  place: Destination; trip: Trip | null; onDone: () => void;
}) {
  const { addTrip, updateTrip, addEvent } = useApp();
  const [draft, setDraft] = useState<NewTripInput>(() => (trip ? { ...trip } : emptyTrip(place.id)));
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
        title: `${place.name}: ${next.title.trim()}`,
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
    <div className="stack tr-form">
      <label htmlFor="tr-title">Was habt ihr vor?</label>
      <input id="tr-title" type="text" value={draft.title} placeholder="z. B. Rheinschlucht"
        onChange={e => patch({ title: e.target.value })} />

      <label htmlFor="tr-from">Datum <span className="muted">(optional)</span></label>
      <div className="row">
        <input id="tr-from" type="date" value={draft.fromDate ?? ''}
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

      <label htmlFor="tr-notes">Notiz <span className="muted">(optional)</span></label>
      <textarea id="tr-notes" rows={3} value={draft.notes}
        onChange={e => patch({ notes: e.target.value })} />

      <label className="hh-switch">
        <input type="checkbox" checked={draft.done}
          onChange={e => patch({ done: e.target.checked })} />
        <span>
          <span className="hh-switch-title">Schon gewesen</span>
          <span className="hh-switch-note">Hakt das Ziel ab. Ohne Datum zählt der heutige Tag.</span>
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
 * One model answering out of what it knows — no web search, no live opening
 * hours — so the note under the list says so. Taking one over writes an
 * ordinary trip; nothing here ends up in the plan on its own.
 */
function Ideas({ place, ideas }: { place: Destination; ideas: TripIdea[] }) {
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
    const message = await fetchTripIdeas(place.id, wishes, refresh);
    setBusy(false);
    setError(message);
  }

  async function take(idea: TripIdea) {
    const notes = [idea.summary, idea.highlights.join(' · '), idea.travel]
      .map(s => s.trim()).filter(Boolean).join('\n');
    const ok = await addTrip({
      destinationId: place.id, title: idea.title, notes,
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
          Claude schlägt Tages- und Zweitagesausflüge für {place.name} vor — passend zu Kindern,
          mit Wünschen, wenn ihr welche habt.
        </p>
      )}
      <p className="hint">
        {family?.weatherPlz
          ? <>Fahrzeiten ab <b>{family.weatherPlz}</b>.</>
          : <>Ohne PLZ steht keine Fahrzeit dabei — unter Einstellungen → Anzeige eintragen.</>}
      </p>
      <div className="row tr-ask">
        <input type="text" value={wishes} placeholder="Wünsche, z. B. mit Kinderwagen"
          aria-label="Wünsche" onChange={e => setWishes(e.target.value)} />
        <button className="btn btn-secondary" disabled={working} onClick={() => ask(ideas.length > 0)}>
          {working ? 'Einen Moment …' : ideas.length ? 'Neue Ideen' : 'Ideen holen'}
        </button>
      </div>
      {error && <p className="notice danger">{error}</p>}

      {ideas.length > 0 && (
        <>
          <ul className="tr-ideas">
            {ideas.map(idea => (
              <li key={idea.id} className="tr-idea">
                <div className="tr-idea-head">
                  <b className="grow">{idea.title}</b>
                  <span className="hh-tag">{durationLabel(idea.duration)}</span>
                </div>
                {idea.summary && <p className="tr-idea-text">{idea.summary}</p>}
                {idea.highlights.length > 0 && (
                  <ul className="tr-highlights">
                    {idea.highlights.map(h => <li key={h}>{h}</li>)}
                  </ul>
                )}
                {(idea.season || idea.travel) && (
                  <p className="hint">{[idea.season, idea.travel].filter(Boolean).join(' · ')}</p>
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
