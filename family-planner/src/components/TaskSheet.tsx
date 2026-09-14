import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import {
  WEEKDAYS, durationStats, emptyTask, fmtMinutes, fmtRate, measuredPerWeek, plannedPerWeek,
  weeklyMinutes,
} from '../lib/tasks.ts';
import { dateLabel } from '../lib/tasks.ts';
import { parseTaskDates } from '../lib/parseTaskDates.ts';
import { COMMON_AREAS, areaLabel } from '../lib/types.ts';
import type { TaskDraft } from '../lib/tasks.ts';
import type { ParsedLine } from '../lib/parseTaskDates.ts';
import type { HouseholdTask, TaskDate, TaskRhythm } from '../lib/types.ts';
import { Sheet } from './Sheet.tsx';

const toDraft = (task: HouseholdTask): TaskDraft => ({
  name: task.name, area: task.area, rhythm: task.rhythm, minutes: task.minutes,
  askDuration: task.askDuration, logEach: task.logEach, coordination: task.coordination,
  weekdays: task.weekdays, ownerPersonId: task.ownerPersonId, active: task.active,
});

/** Describing a job: what it is, how often, how long, and who usually does it. */
export function TaskSheet({ task, onClose }: { task: HouseholdTask | null; onClose: () => void }) {
  const { tasks, taskLogs, people, upsertTask, deleteTask, addTaskDates, removeTaskDate } = useApp();
  const [draft, setDraft] = useState<TaskDraft>(() => (task ? toDraft(task) : emptyTask()));
  const [ownArea, setOwnArea] = useState('');
  const [busy, setBusy] = useState(false);
  // Dates pasted for a task that does not exist yet, written once it does.
  const [pending, setPending] = useState<TaskDate[]>([]);
  const dates = task ? task.dates : pending;

  const patch = (p: Partial<TaskDraft>) => setDraft(d => ({ ...d, ...p }));
  const setRhythm = (r: TaskRhythm) => patch({ rhythm: r });

  // The areas this household actually uses, plus the common ones as a start.
  const areas = useMemo(() => {
    const ids = new Set([...tasks.map(t => t.area), ...COMMON_AREAS.map(a => a.id), draft.area]);
    return [...ids].filter(Boolean).sort();
  }, [tasks, draft.area]);

  const stats = task ? durationStats(taskLogs, task.id) : null;
  const measured = task ? measuredPerWeek(taskLogs, task.id) : 0;
  const doers = people.filter(p => p.doesTasks);
  const r = draft.rhythm;
  const preview: HouseholdTask = { ...draft, id: task?.id ?? '', sortOrder: 0, dates };

  /** Take what actually happened as the plan. */
  function adoptMeasured() {
    if (!task || r.kind === 'termine') return;
    const next: Partial<TaskDraft> = {};
    if (r.kind === 'takt') {
      const perUnit = r.per === 'tag' ? measured / 7 : r.per === 'monat' ? measured * 4.345 : measured;
      const min = Math.max(1, Math.floor(perUnit));
      next.rhythm = { ...r, min, max: Math.max(min, Math.ceil(perUnit)) };
    } else if (r.kind === 'intervall') {
      const days = 7 / Math.max(0.01, measured);
      const per = r.unit === 'tage' ? 1 : r.unit === 'monate' ? 30.4 : 7;
      next.rhythm = { ...r, every: Math.max(1, Math.round(days / per)) };
    } else if (r.kind === 'ereignis') {
      next.rhythm = { ...r, estPerWeek: Math.round(measured * 2) / 2 };
    }
    if (stats && stats.n >= 3) next.minutes = stats.median;
    setDraft(d => ({ ...d, ...next }));
  }

  async function save() {
    if (!draft.name.trim()) return;
    setBusy(true);
    const id = await upsertTask(draft, task?.id);
    if (id && pending.length) await addTaskDates(id, pending);
    setBusy(false);
    if (id) onClose();
  }

  async function remove() {
    if (!task) return;
    setBusy(true);
    const ok = await deleteTask(task.id);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet title={task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'} onClose={onClose}>
      <div className="stack">
        <label htmlFor="hh-name">Was ist zu tun?</label>
        <input id="hh-name" type="text" value={draft.name} placeholder="z. B. Altglas entsorgen"
          onChange={e => patch({ name: e.target.value })} />

        <label>Bereich</label>
        <div className="hh-chips">
          {areas.map(a => (
            <button key={a} type="button" className="hh-chip" aria-pressed={draft.area === a}
              onClick={() => patch({ area: a })}>{areaLabel(a)}</button>
          ))}
        </div>
        <div className="row">
          <input type="text" value={ownArea} placeholder="Eigener Bereich"
            onChange={e => setOwnArea(e.target.value)} />
          <button className="btn btn-secondary" type="button" disabled={!ownArea.trim()}
            onClick={() => { patch({ area: ownArea.trim().toLowerCase() }); setOwnArea(''); }}>
            Übernehmen
          </button>
        </div>

        <label>Wie oft?</label>
        <div className="segmented hh-seg" role="group">
          <button type="button" className={r.kind === 'takt' ? 'active' : ''}
            onClick={() => setRhythm({ kind: 'takt', min: 1, max: 1, per: 'woche' })}>Fester Takt</button>
          <button type="button" className={r.kind === 'intervall' ? 'active' : ''}
            onClick={() => setRhythm({ kind: 'intervall', every: 2, unit: 'wochen' })}>Alle X Wochen</button>
          <button type="button" className={r.kind === 'ereignis' ? 'active' : ''}
            onClick={() => setRhythm({ kind: 'ereignis', trigger: '', estPerWeek: 1 })}>Bei Ereignis</button>
          <button type="button" className={r.kind === 'termine' ? 'active' : ''}
            onClick={() => setRhythm({ kind: 'termine' })}>Feste Termine</button>
        </div>

        {r.kind === 'takt' && (
          <>
            <div className="row">
              <NumberField value={r.min} min={1} max={30} label="mindestens"
                onChange={min => setRhythm({ ...r, min, max: Math.max(min, r.max) })} />
              <span className="row-sep">bis</span>
              <NumberField value={r.max} min={1} max={30} label="höchstens"
                onChange={max => setRhythm({ ...r, max })} />
              <span className="row-sep">mal pro</span>
              <select value={r.per} aria-label="Zeitraum"
                onChange={e => setRhythm({ ...r, per: e.target.value as 'tag' | 'woche' | 'monat' })}>
                <option value="tag">Tag</option>
                <option value="woche">Woche</option>
                <option value="monat">Monat</option>
              </select>
            </div>
            {r.per !== 'tag' && (
              <>
                <label>Feste Tage <span className="muted">(optional)</span></label>
                <div className="hh-chips">
                  {WEEKDAYS.map(d => (
                    <button key={d.n} type="button" className="hh-chip"
                      aria-pressed={draft.weekdays.includes(d.n)}
                      onClick={() => patch({
                        weekdays: draft.weekdays.includes(d.n)
                          ? draft.weekdays.filter(x => x !== d.n)
                          : [...draft.weekdays, d.n].sort((a, b) => a - b),
                      })}>{d.label}</button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {r.kind === 'intervall' && (
          <div className="row">
            <span className="row-sep">alle</span>
            <NumberField value={r.every} min={1} max={52} label="alle wie viele"
              onChange={every => setRhythm({ ...r, every })} />
            <select value={r.unit} aria-label="Einheit"
              onChange={e => setRhythm({ ...r, unit: e.target.value as 'tage' | 'wochen' | 'monate' })}>
              <option value="tage">Tage</option>
              <option value="wochen">Wochen</option>
              <option value="monate">Monate</option>
            </select>
          </div>
        )}

        {r.kind === 'ereignis' && (
          <>
            <input type="text" value={r.trigger} placeholder="Auslöser, z. B. nach jedem Gast"
              onChange={e => setRhythm({ ...r, trigger: e.target.value })} />
            <p className="hint">
              Wird nie als überfällig markiert. Für die Wochenrechnung: ca.{' '}
              <NumberField className="hh-inline-num" value={r.estPerWeek} min={0} max={30} step={0.5}
                label="geschätzt pro Woche"
                onChange={estPerWeek => setRhythm({ ...r, estPerWeek })} />
              {' '}mal pro Woche.
            </p>
          </>
        )}

        {r.kind === 'termine' && (
          <TaskDates dates={dates}
            onAdd={picked => (task ? addTaskDates(task.id, picked)
              : Promise.resolve(setPending(p => [...p, ...picked.filter(d => !p.some(x => x.date === d.date))]
                .sort((a, b) => a.date.localeCompare(b.date))))
                .then(() => true))}
            onRemove={date => (task ? removeTaskDate(task.id, date)
              : Promise.resolve(setPending(p => p.filter(d => d.date !== date))).then(() => true))} />
        )}

        {task && measured > 0 && r.kind !== 'termine' && (
          <div className="hh-measured">
            <span className="grow">
              Gemessen: <b>{fmtRate(measured)}×/Woche</b>
              {stats && stats.n >= 3 && <> · <b>Ø {stats.median} min</b></>}
              {stats && <> <span className="muted">({stats.n} Einträge)</span></>}
            </span>
            <button className="btn btn-secondary" type="button" onClick={adoptMeasured}>Übernehmen</button>
          </div>
        )}

        <label htmlFor="hh-minutes">Wie lange dauert es?</label>
        <p className="hint">
          Richtwert für die Wochenrechnung. Schwankt es stark, unten „Dauer jedes Mal erfassen“.
        </p>
        <div className="row">
          <NumberField id="hh-minutes" value={draft.minutes} min={1} max={600}
            onChange={minutes => patch({ minutes })} />
          <span className="row-sep">Minuten pro Mal</span>
          {stats && stats.n >= 4 && (
            <span className="hh-tag">bisher {stats.min}–{stats.max} min</span>
          )}
        </div>

        <label>Wer macht das normalerweise?</label>
        <div className="hh-chips">
          <button type="button" className="hh-chip" aria-pressed={draft.ownerPersonId === null}
            onClick={() => patch({ ownerPersonId: null })}>Wechselnd</button>
          {doers.map(p => (
            <button key={p.id} type="button" className="hh-chip" aria-pressed={draft.ownerPersonId === p.id}
              onClick={() => patch({ ownerPersonId: p.id })}>{p.name}</button>
          ))}
        </div>
        {!doers.length && (
          <p className="hint">
            Noch niemand übernimmt Aufgaben. In den Einstellungen unter „Haushalt“ auswählen, wer.
          </p>
        )}

        <Switch checked={draft.askDuration} onChange={v => patch({ askDuration: v })}
          title="Dauer jedes Mal erfassen"
          note="Beim Abhaken wird nach den Minuten gefragt — für Sachen, die mal 5 und mal 20 Minuten dauern." />
        <Switch checked={draft.logEach} onChange={v => patch({ logEach: v })}
          title="Jedes Mal einzeln erfassen"
          note="Für Sachen wie Hund spazieren: jede Runde zählt für sich, mit der Person die sie gemacht hat." />
        <Switch checked={draft.coordination} onChange={v => patch({ coordination: v })}
          title="Zählt als Koordination"
          note="Dran denken, planen, organisieren — Aufwand, der nicht in der reinen Ausführungszeit steckt." />
        <Switch checked={draft.active} onChange={v => patch({ active: v })}
          title="Aktiv"
          note="Inaktive Aufgaben bleiben im Katalog, tauchen aber nicht unter „Heute“ auf." />

        <div className="sheet-actions hh-actions">
          <span className="hh-load">
            Ergibt <b>{fmtMinutes(weeklyMinutes(preview))}</b> pro Woche
            <span className="muted"> ({fmtRate(plannedPerWeek(preview))}×)</span>
          </span>
          {task && (
            <button className="btn btn-danger" type="button" onClick={remove} disabled={busy}>Löschen</button>
          )}
          <button className="btn" type="button" onClick={save} disabled={busy || !draft.name.trim()}>
            Speichern
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * A number field that can be empty while it is being typed in.
 *
 * Binding the input straight to the number turned every cleared field back
 * into 1 on the same keystroke, so the digit could never be deleted — only
 * typed around, which is how "1× pro Woche" became "13×". The text is its own
 * state while the field has focus: an empty field stays empty, the number is
 * passed up as soon as it reads as one, and leaving the field settles it —
 * empty goes back to the last value that made sense, out of range is pulled
 * into it.
 */
function NumberField({ value, min, max, step, label, id, className, onChange }: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label?: string;
  id?: string;
  className?: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(() => String(value));
  const lastValid = useRef(value);

  // Follow the value when something else changes it — "Übernehmen" does.
  useEffect(() => {
    if (value !== lastValid.current) {
      lastValid.current = value;
      setText(String(value));
    }
  }, [value]);

  return (
    <input type="number" inputMode={step ? 'decimal' : 'numeric'} id={id} className={className}
      min={min} max={max} step={step} value={text} aria-label={label}
      onChange={e => {
        const raw = e.target.value;
        setText(raw);
        if (raw === '') return;
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        lastValid.current = n;
        onChange(n);
      }}
      onBlur={() => {
        const n = Number(text);
        if (text === '' || !Number.isFinite(n)) {
          setText(String(lastValid.current));
          return;
        }
        const settled = Math.min(max, Math.max(min, n));
        lastValid.current = settled;
        setText(String(settled));
        onChange(settled);
      }} />
  );
}

function Switch({ checked, onChange, title, note }: {
  checked: boolean; onChange: (v: boolean) => void; title: string; note: string;
}) {
  return (
    <label className="hh-switch">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>
        <span className="hh-switch-title">{title}</span>
        <span className="hh-switch-note">{note}</span>
      </span>
    </label>
  );
}

/* ------------------------------------------------------- planned dates */

/**
 * A list of days, usually pasted straight out of the message it arrived in.
 *
 * The parser proposes and this confirms: every line it read is shown with
 * what it made of it, the unsure ones unticked, so nothing is booked that
 * nobody looked at. What it could not read it does not mention — those lines
 * are greetings.
 */
function TaskDates({ dates, onAdd, onRemove }: {
  dates: TaskDate[];
  onAdd: (dates: TaskDate[]) => Promise<boolean>;
  onRemove: (date: string) => Promise<boolean>;
}) {
  const [paste, setPaste] = useState('');
  const [parsed, setParsed] = useState<ParsedLine[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = dates.filter(d => d.date >= today);
  const past = dates.length - upcoming.length;

  function read(text: string) {
    const lines = parseTaskDates(text);
    setParsed(lines);
    setPicked(new Set(lines.filter(l => l.suggested && l.date).map(l => l.date!)));
  }

  async function take() {
    if (!parsed) return;
    setBusy(true);
    const chosen: TaskDate[] = parsed
      .filter(l => l.date && picked.has(l.date))
      .map(l => ({ date: l.date!, note: l.text }));
    const ok = await onAdd(chosen);
    setBusy(false);
    if (ok) { setParsed(null); setPaste(''); setPicked(new Set()); }
  }

  return (
    <>
      <p className="hint">
        Kein Takt, sondern Tage: die Liste aus der Nachricht hier einfügen. Aufzählungszeichen,
        Fett und Kursiv dürfen drinbleiben.
      </p>
      <textarea rows={4} value={paste} placeholder={'- Mon, Sept 7\n- Sat, Oct 3\n- 15.10.'}
        onChange={e => { setPaste(e.target.value); if (!e.target.value.trim()) setParsed(null); }} />
      <div className="row">
        <button className="btn btn-secondary" type="button" disabled={!paste.trim()}
          onClick={() => read(paste)}>Termine lesen</button>
        {parsed && <span className="hint">{parsed.length} Zeilen mit Datum gefunden</span>}
      </div>

      {parsed && (parsed.length ? (
        <>
          <ul className="settings-list hh-parsed">
            {parsed.map(line => (
              <li key={line.date}>
                <label className="hh-doer">
                  <input type="checkbox" checked={picked.has(line.date!)}
                    onChange={e => setPicked(p => {
                      const next = new Set(p);
                      if (e.target.checked) next.add(line.date!); else next.delete(line.date!);
                      return next;
                    })} />
                  <span className="grow">
                    <b>{dateLabel(line.date!)}</b>
                    {line.emphasis === 'bold' && <span className="hh-tag hh-tag-coord">neu</span>}
                    {line.emphasis === 'italic' && <span className="hh-tag">unsicher</span>}
                    {line.weekdayMismatch && (
                      <span className="hh-tag hh-tag-drift">Wochentag passt nicht</span>
                    )}
                    <span className="hint hh-parsed-line">{line.text}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button className="btn" type="button" disabled={busy || !picked.size} onClick={take}>
            {picked.size} Termine übernehmen
          </button>
        </>
      ) : (
        <p className="notice warn">In dem Text steht kein Datum, das ich lesen kann.</p>
      ))}

      <label>Geplante Termine</label>
      {upcoming.length ? (
        <ul className="settings-list">
          {upcoming.map(d => (
            <li key={d.date}>
              <span className="grow">
                <b>{dateLabel(d.date)}</b>
                {d.note && d.note !== d.date && <span className="hint hh-parsed-line">{d.note}</span>}
              </span>
              <button className="linklike danger" type="button" onClick={() => onRemove(d.date)}>
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Noch keine Termine eingetragen.</p>
      )}
      {past > 0 && <p className="hint">{past} vergangene Termine bleiben als Verlauf stehen.</p>}
    </>
  );
}
