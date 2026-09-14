import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { dayLabel, todayKey } from '../lib/dates.ts';
import {
  dailyTarget, defaultMinutes, driftsFromPlan, durationStats, fmtElapsed, fmtMinutes, fmtRate,
  dateLabel, lastLog, logsOnDay, measuredPerWeek, minutesByPerson, nextDate, rhythmLabel,
  taskStatus, weeklyMinutes,
} from '../lib/tasks.ts';
import { areaLabel } from '../lib/types.ts';
import type { HouseholdTask, Person, TaskLog } from '../lib/types.ts';
import { TaskSheet } from './TaskSheet.tsx';
import { Sheet } from './Sheet.tsx';

type Tab = 'heute' | 'katalog' | 'verteilung';
type Timer = { taskId: string; personId: string; startedAt: number };
/** What was just booked, so it can be corrected or taken back. */
type Booked = { log: TaskLog; task: HouseholdTask; person: Person };

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 28;
// A running stopwatch belongs to the phone it was started on, not to the
// family: two people timing the same job from two rooms is not a thing.
const TIMER_KEY = 'fp-household-timer';

function readTimer(): Timer | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    return raw ? (JSON.parse(raw) as Timer) : null;
  } catch {
    return null;
  }
}
function writeTimer(t: Timer | null) {
  try {
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t));
    else localStorage.removeItem(TIMER_KEY);
  } catch { /* private window: the stopwatch just does not survive a reload */ }
}

const initials = (p: Person) => p.shortName?.trim() || p.name.charAt(0).toUpperCase();

/** The household as its own screen — one day could be its own address. */
export function Household({ onClose }: { onClose: () => void }) {
  const { family, tasks, taskLogs, people, canEdit, logTask, setLogMinutes, deleteTaskLog } = useApp();
  const tz = family?.timezone ?? 'Europe/Zurich';

  const [tab, setTab] = useState<Tab>('heute');
  const [editing, setEditing] = useState<HouseholdTask | null>(null);
  const [creating, setCreating] = useState(false);
  const [asking, setAsking] = useState<{ task: HouseholdTask; person: Person } | null>(null);
  const [timer, setTimer] = useState<Timer | null>(() => readTimer());
  const [booked, setBooked] = useState<Booked | null>(null);

  const doers = useMemo(() => {
    const picked = people.filter(p => p.doesTasks);
    // Before anyone has been picked in the settings, everyone is offered —
    // an empty row of buttons would make the screen look broken.
    return picked.length ? picked : people;
  }, [people]);

  // A booking speaks up for a few seconds, long enough to fix the minutes.
  useEffect(() => {
    if (!booked) return;
    const id = setTimeout(() => setBooked(null), 6000);
    return () => clearTimeout(id);
  }, [booked]);

  async function book(task: HouseholdTask, person: Person, minutes: number) {
    const log = await logTask(task.id, person.id, minutes);
    if (log) setBooked({ log, task, person });
  }

  function onPersonTap(task: HouseholdTask, person: Person) {
    if (task.askDuration) setAsking({ task, person });
    else book(task, person, defaultMinutes(task, taskLogs));
  }

  function startTimer(taskId: string, personId: string) {
    const t = { taskId, personId, startedAt: Date.now() };
    setTimer(t);
    writeTimer(t);
    setAsking(null);
  }

  function stopTimer(commit: boolean) {
    const t = timer;
    setTimer(null);
    writeTimer(null);
    if (!commit || !t) return;
    const task = tasks.find(x => x.id === t.taskId);
    const person = people.find(p => p.id === t.personId);
    if (task && person) book(task, person, Math.max(1, (Date.now() - t.startedAt) / 60000));
  }

  const shared = { tasks, taskLogs, tz, doers, canEdit, onLog: onPersonTap, onEdit: setEditing };

  return (
    <div className="hh-screen">
      <header className="topbar no-print">
        <div className="topbar-left">
          <button className="icon-btn" aria-label="Zurück zum Plan" onClick={onClose}>‹</button>
          <h1>Haushalt</h1>
        </div>
        <div className="topbar-right">
          <div className="segmented" role="tablist" aria-label="Ansicht">
            <button role="tab" aria-selected={tab === 'heute'} className={tab === 'heute' ? 'active' : ''}
              onClick={() => setTab('heute')}>Heute</button>
            <button role="tab" aria-selected={tab === 'katalog'} className={tab === 'katalog' ? 'active' : ''}
              onClick={() => setTab('katalog')}>Aufgaben</button>
            <button role="tab" aria-selected={tab === 'verteilung'} className={tab === 'verteilung' ? 'active' : ''}
              onClick={() => setTab('verteilung')}>Verteilung</button>
          </div>
        </div>
      </header>

      {timer && <RunBar timer={timer} tasks={tasks} people={people} onStop={stopTimer} />}

      <main className="hh-body">
        {tab === 'heute' && <Today {...shared} />}
        {tab === 'katalog' && <Catalog {...shared} onNew={() => setCreating(true)} />}
        {tab === 'verteilung' && <Distribution tasks={tasks} taskLogs={taskLogs} people={people} />}
      </main>

      {booked && (
        <div className="hh-booked" role="status">
          <span className="grow">
            <b>{booked.task.name}</b> · {booked.person.name}
          </span>
          <span className="hh-adjust">
            <button className="icon-btn" aria-label="Fünf Minuten weniger"
              onClick={() => { setLogMinutes(booked.log.id, Math.max(1, booked.log.minutes - 5)); setBooked({ ...booked, log: { ...booked.log, minutes: Math.max(1, booked.log.minutes - 5) } }); }}>−</button>
            <b className="hh-num">{fmtMinutes(booked.log.minutes)}</b>
            <button className="icon-btn" aria-label="Fünf Minuten mehr"
              onClick={() => { setLogMinutes(booked.log.id, booked.log.minutes + 5); setBooked({ ...booked, log: { ...booked.log, minutes: booked.log.minutes + 5 } }); }}>+</button>
          </span>
          <button className="linklike" onClick={() => { deleteTaskLog(booked.log.id); setBooked(null); }}>
            Rückgängig
          </button>
        </div>
      )}

      {asking && (
        <DurationSheet task={asking.task} person={asking.person} logs={taskLogs}
          onClose={() => setAsking(null)}
          onSave={minutes => { book(asking.task, asking.person, minutes); setAsking(null); }}
          onTimer={() => startTimer(asking.task.id, asking.person.id)} />
      )}
      {editing && <TaskSheet task={editing} onClose={() => setEditing(null)} />}
      {creating && <TaskSheet task={null} onClose={() => setCreating(false)} />}
    </div>
  );
}

/* ----------------------------------------------------------------- rows */

type RowProps = {
  tasks: HouseholdTask[];
  taskLogs: TaskLog[];
  tz: string;
  doers: Person[];
  canEdit: boolean;
  onLog: (task: HouseholdTask, person: Person) => void;
  onEdit: (task: HouseholdTask) => void;
};

function TaskRow({ task, taskLogs, tz, doers, canEdit, onLog, onEdit, showLoad }: {
  task: HouseholdTask; taskLogs: TaskLog[]; tz: string; doers: Person[]; canEdit: boolean;
  onLog: (task: HouseholdTask, person: Person) => void;
  onEdit: (task: HouseholdTask) => void;
  showLoad?: boolean;
}) {
  const status = taskStatus(task, taskLogs, tz);
  const last = lastLog(taskLogs, task.id);
  const lastBy = last ? doers.find(p => p.id === last.personId) : null;
  const stats = durationStats(taskLogs, task.id);
  const target = dailyTarget(task);
  const today = logsOnDay(taskLogs, task.id, todayKey(tz), tz);
  const drift = driftsFromPlan(task, taskLogs);
  const next = task.rhythm.kind === 'termine' ? nextDate(task, tz) : null;

  const duration = stats && stats.n >= 4 && stats.max - stats.min >= 5
    ? `Ø ${fmtMinutes(stats.median)} (${stats.min}–${stats.max})`
    : fmtMinutes(task.minutes);

  return (
    <li className={`hh-row is-${status.kind}`}>
      <button className="hh-main" onClick={() => onEdit(task)}
        aria-label={`${task.name} bearbeiten`}>
        <span className="hh-name">{task.name}</span>
        <span className="hh-meta">
          <span className="hh-num">{rhythmLabel(task, todayKey(tz))}</span>
          <span className="hh-sep">·</span>
          <span className="hh-num">{duration}</span>
          {task.rhythm.kind === 'termine' && next && (
            <>
              <span className="hh-sep">·</span>
              <span>nächster {dateLabel(next)}</span>
            </>
          )}
          {task.coordination && <span className="hh-tag hh-tag-coord">Koordination</span>}
          {drift && (
            <span className="hh-tag hh-tag-drift">
              gemessen {fmtRate(measuredPerWeek(taskLogs, task.id))}×/Wo
            </span>
          )}
        </span>
        <span className="hh-meta hh-history">
          {last
            ? `zuletzt ${relative(last.doneAt, tz)}${lastBy ? `, ${lastBy.name}` : ''}`
            : 'noch nie erfasst'}
        </span>
      </button>

      {target && (
        <span className="hh-pips" title={`heute ${today.length} von ${target.max}`}>
          {Array.from({ length: Math.max(target.max, today.length) }, (_, i) => {
            const log = today[i];
            const by = log ? doers.find(p => p.id === log.personId) : null;
            return (
              <span key={i} className={`hh-pip${log ? ' is-done' : ''}`}
                style={by ? ({ '--p': by.color } as React.CSSProperties) : undefined} />
            );
          })}
        </span>
      )}
      {!target && status.kind === 'over' && <span className="hh-state is-over">überfällig</span>}
      {!target && status.kind === 'due' && <span className="hh-state is-due">fällig</span>}
      {showLoad && <span className="hh-load-cell"><b>{fmtMinutes(weeklyMinutes(task))}</b>pro Woche</span>}

      {!showLoad && (
        <span className="hh-who">
          {doers.map(p => (
            <button key={p.id} className="hh-person" style={{ '--p': p.color } as React.CSSProperties}
              disabled={!canEdit} onClick={() => onLog(task, p)}
              title={`${p.name} hat das erledigt`} aria-label={`${task.name}: ${p.name} hat das erledigt`}>
              {initials(p)}
            </button>
          ))}
        </span>
      )}
    </li>
  );
}

function relative(iso: string, tz: string): string {
  const key = todayKey(tz, Date.parse(iso));
  const today = todayKey(tz);
  if (key === today) return 'heute';
  const days = Math.round((Date.parse(today) - Date.parse(key)) / DAY_MS);
  if (days === 1) return 'gestern';
  if (days < 7) return `vor ${days} Tagen`;
  const [, m, d] = key.split('-').map(Number);
  return `am ${d}.${m}.`;
}

/* ---------------------------------------------------------------- today */

function Today(props: RowProps) {
  const { tasks, taskLogs, tz } = props;
  const { people } = useApp();
  const today = todayKey(tz);
  const active = tasks.filter(t => t.active);

  const doneToday = taskLogs.filter(l => todayKey(tz, Date.parse(l.doneAt)) === today);
  const perPerson = minutesByPerson(doneToday, 0);

  const status = (t: HouseholdTask) => taskStatus(t, taskLogs, tz).kind;
  const waiting = active.filter(t => status(t) === 'over' || status(t) === 'due');
  const onEvent = active.filter(t => status(t) === 'event');
  const running = active.filter(t => status(t) === 'ok');

  if (!tasks.length) return <EmptyCatalog />;

  return (
    <>
      <div className="hh-head">
        <h2>{dayLabel(today)}</h2>
        <span className="hh-num muted">
          {doneToday.length} erfasst · {fmtMinutes([...perPerson.values()].reduce((a, b) => a + b, 0))}
        </span>
      </div>
      <div className="hh-legend">
        {people.filter(p => perPerson.get(p.id)).map(p => (
          <span key={p.id}>
            <span className="dot" style={{ background: p.color }} aria-hidden="true" />
            {p.name} <b className="hh-num">{fmtMinutes(perPerson.get(p.id) ?? 0)}</b>
          </span>
        ))}
        {!perPerson.size && <span className="muted">Heute noch nichts erfasst.</span>}
      </div>

      <Section title="Jetzt dran" note="Tippen = erledigt">
        {waiting.length
          ? waiting.map(t => <TaskRow key={t.id} task={t} {...props} />)
          : <p className="hint">Nichts offen. Selten, aber es kommt vor.</p>}
      </Section>

      {onEvent.length > 0 && (
        <Section title="Bei Ereignis" note="ohne festen Takt">
          {onEvent.map(t => <TaskRow key={t.id} task={t} {...props} />)}
        </Section>
      )}

      <Section title="Läuft" note={`${running.length} Aufgaben`}>
        {running.map(t => <TaskRow key={t.id} task={t} {...props} />)}
      </Section>
    </>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <>
      <div className="hh-head">
        <h2>{title}</h2>
        <span className="hh-eyebrow">{note}</span>
      </div>
      <ul className="hh-list">{children}</ul>
    </>
  );
}

/* -------------------------------------------------------------- catalog */

function Catalog(props: RowProps & { onNew: () => void }) {
  const { tasks, canEdit, onNew } = props;
  const [area, setArea] = useState<string>('alle');

  const areas = useMemo(() => [...new Set(tasks.map(t => t.area))].sort(), [tasks]);
  const shown = tasks.filter(t => area === 'alle' || t.area === area);
  const total = shown.filter(t => t.active).reduce((s, t) => s + weeklyMinutes(t), 0);

  if (!tasks.length) return <EmptyCatalog />;

  return (
    <>
      <div className="hh-head">
        <h2>Aufgabenkatalog</h2>
        <span className="hh-num muted">{shown.length} Aufgaben · {fmtMinutes(total)}/Woche</span>
      </div>
      <div className="hh-chips">
        <button className="hh-chip" aria-pressed={area === 'alle'} onClick={() => setArea('alle')}>Alle</button>
        {areas.map(a => (
          <button key={a} className="hh-chip" aria-pressed={area === a}
            onClick={() => setArea(a)}>{areaLabel(a)}</button>
        ))}
      </div>

      {(area === 'alle' ? areas : [area]).map(a => {
        const items = shown.filter(t => t.area === a);
        if (!items.length) return null;
        const sum = items.filter(t => t.active).reduce((s, t) => s + weeklyMinutes(t), 0);
        return (
          <div key={a}>
            <div className="hh-head">
              <span className="hh-eyebrow">{areaLabel(a)}</span>
              <span className="hh-num muted">{fmtMinutes(sum)}/Woche</span>
            </div>
            <ul className="hh-list">
              {items.map(t => (
                <TaskRow key={t.id} task={t} {...props} showLoad />
              ))}
            </ul>
          </div>
        );
      })}

      {canEdit && (
        <p className="add-note">
          <button className="btn" onClick={onNew}>Aufgabe anlegen</button>
        </p>
      )}
    </>
  );
}

function EmptyCatalog() {
  const { canEdit, addStarterTasks } = useApp();
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  return (
    <div className="hh-empty">
      <h2>Noch keine Aufgaben</h2>
      <p className="muted">
        Trag ein, was bei euch anfällt — wie oft es vorkommt und wie lange es dauert. Danach
        genügt ein Tipp pro Erledigung, und die Verteilung rechnet sich von selbst.
      </p>
      {canEdit && (
        <div className="row">
          <button className="btn" disabled={busy}
            onClick={async () => { setBusy(true); await addStarterTasks(); setBusy(false); }}>
            Übliche Aufgaben übernehmen
          </button>
          <button className="btn btn-secondary" onClick={() => setCreating(true)}>Eigene anlegen</button>
        </div>
      )}
      <p className="hint">
        Die Vorschläge sind ein Anfang, kein Gesetz: alles lässt sich umbenennen, ändern oder löschen.
      </p>
      {creating && <TaskSheet task={null} onClose={() => setCreating(false)} />}
    </div>
  );
}

/* --------------------------------------------------------- distribution */

function Distribution({ tasks, taskLogs, people }: {
  tasks: HouseholdTask[]; taskLogs: TaskLog[]; people: Person[];
}) {
  const since = Date.now() - WINDOW_DAYS * DAY_MS;
  const split = minutesByPerson(taskLogs, since);
  const total = [...split.values()].reduce((a, b) => a + b, 0);
  const planned = tasks.filter(t => t.active).reduce((s, t) => s + weeklyMinutes(t), 0);
  const involved = people.filter(p => (split.get(p.id) ?? 0) > 0);

  const areas = [...new Set(tasks.map(t => t.area))]
    .map(a => {
      const ids = new Set(tasks.filter(t => t.area === a).map(t => t.id));
      const per = minutesByPerson(taskLogs, since, ids);
      const sum = [...per.values()].reduce((x, y) => x + y, 0);
      return { area: a, per, sum };
    })
    .filter(r => r.sum > 0)
    .sort((x, y) => y.sum - x.sum);
  const widest = areas[0]?.sum ?? 1;

  const biggest = tasks.filter(t => t.active)
    .slice().sort((x, y) => weeklyMinutes(y) - weeklyMinutes(x)).slice(0, 6);

  if (!total) {
    return (
      <div className="hh-empty">
        <h2>Noch nichts erfasst</h2>
        <p className="muted">
          Sobald unter „Heute“ das erste Mal jemand getippt hat, steht hier, wie die Arbeit liegt.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hh-head">
        <h2>Wie die Last liegt</h2>
        <span className="hh-eyebrow">letzte 4 Wochen</span>
      </div>
      <p className="hh-total">
        <b className="hh-num">{fmtMinutes(total / 4)}</b>
        <span className="muted">
          erfasst pro Woche · geplant wären <span className="hh-num">{fmtMinutes(planned)}</span>
        </span>
      </p>
      <div className="hh-split" role="img"
        aria-label={involved.map(p => `${p.name} ${Math.round(((split.get(p.id) ?? 0) / total) * 100)} Prozent`).join(', ')}>
        {involved.map(p => {
          const share = Math.round(((split.get(p.id) ?? 0) / total) * 100);
          return (
            <span key={p.id} style={{ background: p.color, flexGrow: split.get(p.id) ?? 0 }}>
              {share >= 12 ? `${share}%` : ''}
            </span>
          );
        })}
      </div>
      <div className="hh-legend">
        {involved.map(p => (
          <span key={p.id}>
            <span className="dot" style={{ background: p.color }} aria-hidden="true" />
            {p.name} <b className="hh-num">{fmtMinutes((split.get(p.id) ?? 0) / 4)}</b> / Woche
          </span>
        ))}
      </div>

      <div className="hh-head"><h2>Nach Bereich</h2><span className="hh-eyebrow">pro Woche</span></div>
      {areas.map(r => (
        <div key={r.area} className="hh-bar-row">
          <span>{areaLabel(r.area)}</span>
          <span className="hh-minibar" style={{ width: `${Math.round((r.sum / widest) * 100)}%` }}>
            {involved.map(p => (
              <i key={p.id} style={{ background: p.color, flexGrow: r.per.get(p.id) ?? 0 }} />
            ))}
          </span>
          <span className="hh-num muted">{fmtMinutes(r.sum / 4)}</span>
        </div>
      ))}

      <div className="hh-head"><h2>Die grössten Brocken</h2><span className="hh-eyebrow">geplante Zeit</span></div>
      <ul className="hh-list">
        {biggest.map(t => (
          <li key={t.id} className="hh-row">
            <span className="hh-main">
              <span className="hh-name">{t.name}</span>
              <span className="hh-meta">
                <span className="hh-num">{rhythmLabel(t)}</span>
                <span className="hh-sep">·</span>
                {people.find(p => p.id === t.ownerPersonId)?.name ?? 'wechselnd'}
              </span>
            </span>
            <span className="hh-load-cell"><b>{fmtMinutes(weeklyMinutes(t))}</b>pro Woche</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ------------------------------------------------------------- duration */

/** Zeit zusammentippen: three blocks that add up, or a stopwatch instead. */
function DurationSheet({ task, person, logs, onClose, onSave, onTimer }: {
  task: HouseholdTask; person: Person; logs: TaskLog[];
  onClose: () => void; onSave: (minutes: number) => void; onTimer: () => void;
}) {
  const [minutes, setMinutes] = useState(0);
  const stats = durationStats(logs, task.id);

  return (
    <Sheet title={task.name} onClose={onClose}>
      <p className="hh-dur-note">{person.name} hat das gerade gemacht. Zeit zusammentippen:</p>
      <p className={`hh-dur-total hh-num${minutes ? '' : ' is-empty'}`} role="status" aria-live="polite">
        {minutes ? fmtMinutes(minutes) : '0 min'}
      </p>
      <div className="hh-add-row">
        {[5, 15, 60].map(step => (
          <button key={step} className="hh-add" onClick={() => setMinutes(m => m + step)}>
            +{step === 60 ? '1 h' : `${step} min`}
          </button>
        ))}
      </div>
      <p className="hh-dur-note">
        <button className="linklike" onClick={() => setMinutes(0)}>Zurücksetzen</button>
      </p>
      {stats && stats.n >= 4 && (
        <p className="hh-dur-note muted">
          Bisher zwischen {stats.min} und {stats.max} min, meistens {stats.median}.
        </p>
      )}
      <div className="sheet-actions">
        <button className="btn btn-secondary" onClick={onTimer}>Stoppuhr statt tippen</button>
        <button className="btn" disabled={!minutes} onClick={() => onSave(minutes)}>Erfassen</button>
      </div>
    </Sheet>
  );
}

/** While the stopwatch runs it stays in sight, on every tab. */
function RunBar({ timer, tasks, people, onStop }: {
  timer: Timer; tasks: HouseholdTask[]; people: Person[]; onStop: (commit: boolean) => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const task = tasks.find(t => t.id === timer.taskId);
  const person = people.find(p => p.id === timer.personId);
  if (!task) return null;

  return (
    <div className="hh-runbar">
      <span className="grow">
        <b>{task.name}</b>
        <span className="hint">
          läuft seit <span className="hh-num">{fmtElapsed(Date.now() - timer.startedAt)}</span>
          {person ? ` · ${person.name}` : ''}
        </span>
      </span>
      <button className="btn" onClick={() => onStop(true)}>Fertig</button>
      <button className="icon-btn" aria-label="Stoppuhr verwerfen" onClick={() => onStop(false)}>×</button>
    </div>
  );
}
