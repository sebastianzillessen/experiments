import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../context/AppContext.tsx';
import type { EditScope, NewEventInput } from '../context/AppContext.tsx';
import type { PlannerEvent } from '../lib/types.ts';
import { formatClock, timeValue, weekdayOf } from '../lib/dates.ts';
import { parseTitleTime } from '../lib/parseTitleTime.ts';
import { parseTitleRepeat } from '../lib/parseTitleRepeat.ts';
import type { RepeatRule } from '../lib/recurrence.ts';
import { Sheet } from './Sheet.tsx';

export type QuickAddPrefill = {
  date: string;
  /** null = the shared "Familie" column. */
  personId: string | null;
};

/** Monday first — the planner's week starts there. */
const WEEKDAY_CHIPS = [
  { day: 1, label: 'Mo' }, { day: 2, label: 'Di' }, { day: 3, label: 'Mi' },
  { day: 4, label: 'Do' }, { day: 5, label: 'Fr' }, { day: 6, label: 'Sa' },
  { day: 0, label: 'So' },
];

/**
 * The fast path: a title, who it is for, the day — done. All-day is the
 * default because that is how most lines on the paper sheet read; switching
 * to von–bis reveals the two time fields, and "wöchentlich" the weekdays.
 */
export function QuickAddSheet({ prefill, existing, scope = 'series', onClose }: {
  prefill?: QuickAddPrefill;
  existing?: PlannerEvent;
  /** Which part of a series an edit applies to. */
  scope?: EditScope;
  onClose: () => void;
}) {
  const { people, addEvent, updateEvent, family } = useApp();
  const tz = family?.timezone ?? 'Europe/Zurich';
  const timeFormat = family?.timeFormat ?? '24h';

  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? prefill?.date ?? '');
  const [endDate, setEndDate] = useState(existing?.endDate ?? prefill?.date ?? '');
  const [allDay, setAllDay] = useState(existing ? existing.allDay : true);
  // An <input type="time"> value is always 24h "HH:MM" regardless of how the
  // browser displays it — never seed it with the family's display format.
  const [startTime, setStartTime] = useState(
    existing?.startsAt ? timeValue(existing.startsAt, tz) : '09:00');
  const [endTime, setEndTime] = useState(
    existing?.endsAt ? timeValue(existing.endsAt, tz) : '10:00');
  const [selected, setSelected] = useState<string[]>(
    existing ? existing.personIds : (prefill?.personId ? [prefill.personId] : []));

  // Wiederholung. A single occurrence pulled out of a series never carries the
  // rule — that edit becomes a standalone entry.
  const seriesRule = scope === 'series' ? existing?.repeat ?? null : null;
  const [repeats, setRepeats] = useState(Boolean(seriesRule));
  const [weekdays, setWeekdays] = useState<number[]>(seriesRule?.weekdays ?? []);
  const [interval, setInterval] = useState(seriesRule?.interval ?? 1);
  const [until, setUntil] = useState(seriesRule?.until ?? '');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Kita jeden Freitag 8-16" carries its own time and pattern. Both are read
  // while typing, shown below the field, and applied on save — never by
  // rewriting the field under the cursor. Touching a control, or dismissing
  // the hint, hands control back.
  const [touched, setTouched] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const suggestion = useMemo(() => {
    if (existing || touched || dismissed) return null;
    // The pattern is taken out first; the time parser reads what is left.
    const pattern = parseTitleRepeat(title);
    const rest = pattern ? pattern.title : title;
    const time = parseTitleTime(rest);
    if (!pattern && !time) return null;
    return {
      title: time ? time.title : rest,
      startTime: time?.startTime ?? null,
      endTime: time?.endTime ?? null,
      repeat: pattern?.repeat ?? null,
    };
  }, [existing, title, touched, dismissed]);

  useEffect(() => {
    if (!suggestion) return;
    if (suggestion.startTime && suggestion.endTime) {
      setAllDay(false);
      setStartTime(suggestion.startTime);
      setEndTime(suggestion.endTime);
    }
    if (suggestion.repeat) {
      setRepeats(true);
      setInterval(suggestion.repeat.interval);
      // "jede Woche" names no day — the chosen start date is the day.
      setWeekdays(suggestion.repeat.weekdays.length
        ? suggestion.repeat.weekdays
        : (startDate ? [weekdayOf(startDate)] : []));
    }
  }, [suggestion, startDate]);

  const showTime = (value: string) => {
    const [hh, mm] = value.split(':').map(Number);
    return formatClock(hh, mm, timeFormat);
  };

  function togglePerson(id: string) {
    setSelected(prev => (prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]));
  }

  function toggleWeekday(day: number) {
    setTouched(true);
    setWeekdays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]));
  }

  function enableRepeat(on: boolean) {
    setTouched(true);
    setRepeats(on);
    if (on && weekdays.length === 0 && startDate) setWeekdays([weekdayOf(startDate)]);
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    const finalTitle = suggestion ? suggestion.title : title;
    if (!finalTitle.trim()) {
      setError('Bitte einen Titel eingeben.');
      return;
    }
    if (!startDate) {
      setError('Bitte ein Datum wählen.');
      return;
    }

    const days = weekdays.length ? weekdays : [weekdayOf(startDate)];
    const repeat: RepeatRule | null = repeats
      ? { freq: 'weekly', interval, weekdays: days, until: until || null }
      : null;
    if (repeat && repeat.until && repeat.until < startDate) {
      setError('Das Enddatum der Wiederholung liegt vor dem ersten Termin.');
      return;
    }

    const input: NewEventInput = {
      title: finalTitle,
      notes,
      allDay: suggestion?.startTime ? false : allDay,
      startDate,
      endDate: endDate || startDate,
      startTime,
      endTime,
      personIds: selected,
      repeat,
    };

    setBusy(true);
    const ok = existing?.id
      ? await updateEvent(existing.id, input, scope, existing.occurrence)
      : await addEvent(input);
    setBusy(false);
    if (ok) onClose();
    else setError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
  }

  const heading = !existing ? 'Neuer Eintrag'
    : scope === 'occurrence' ? 'Nur diesen Termin bearbeiten'
    : 'Eintrag bearbeiten';

  return (
    <Sheet title={heading} onClose={onClose}>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <label htmlFor="qa-title">Was?</label>
        <input id="qa-title" value={title} autoFocus placeholder="z. B. Kita jeden Freitag 8-16"
          onChange={e => setTitle(e.target.value)} />
        {suggestion && (
          <div className="notice info parsed-time" id="qa-parsed">
            <span className="grow">
              Erkannt:{' '}
              <strong>
                {suggestion.repeat && repeatHint(suggestion.repeat, startDate)}
                {suggestion.repeat && suggestion.startTime && ' · '}
                {suggestion.startTime && (
                  <>
                    {showTime(suggestion.startTime)}
                    {suggestion.endTime !== suggestion.startTime && `–${showTime(suggestion.endTime!)}`}
                  </>
                )}
              </strong>{' '}
              · Titel wird „{suggestion.title}“
            </span>
            <button type="button" className="linklike" onClick={() => setDismissed(true)}>
              doch nicht
            </button>
          </div>
        )}

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
          <label><input type="radio" name="qa-mode" checked={allDay} onChange={() => { setTouched(true); setAllDay(true); }} /> ganztägig</label>
          <label><input type="radio" name="qa-mode" checked={!allDay} onChange={() => { setTouched(true); setAllDay(false); }} /> von–bis</label>
        </div>
        {!allDay && (
          // lang nudges Chrome towards the family's clock format; Safari and
          // Firefox follow the operating system and ignore it. The value is
          // 24h either way, so nothing downstream depends on what is shown.
          <div className="row" lang={timeFormat === '12h' ? 'en-US' : 'de-CH'}>
            <input id="qa-start-time" type="time" value={startTime}
              onChange={e => { setTouched(true); setStartTime(e.target.value); }} />
            <span className="row-sep">–</span>
            <input id="qa-end-time" type="time" value={endTime}
              onChange={e => { setTouched(true); setEndTime(e.target.value); }} />
          </div>
        )}

        {scope === 'occurrence' ? (
          <p className="hint">
            Diese Änderung gilt nur für diesen Termin — die Serie läuft unverändert weiter.
          </p>
        ) : (
          <>
            <label>Wiederholen?</label>
            <div className="row radios">
              <label><input type="radio" name="qa-repeat" checked={!repeats} onChange={() => enableRepeat(false)} /> einmalig</label>
              <label><input type="radio" name="qa-repeat" checked={repeats} onChange={() => enableRepeat(true)} /> wöchentlich</label>
            </div>
            {repeats && (
              <>
                <div className="chips-row" id="qa-weekdays">
                  {WEEKDAY_CHIPS.map(({ day, label }) => (
                    <button type="button" key={day}
                      className={`person-chip${weekdays.includes(day) ? ' selected' : ''}`}
                      aria-pressed={weekdays.includes(day)}
                      style={weekdays.includes(day) ? { borderColor: 'var(--accent)', background: 'var(--accent)' } : undefined}
                      onClick={() => toggleWeekday(day)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <select id="qa-interval" value={interval}
                    onChange={e => { setTouched(true); setInterval(Number(e.target.value)); }}>
                    <option value={1}>jede Woche</option>
                    <option value={2}>alle 2 Wochen</option>
                    <option value={3}>alle 3 Wochen</option>
                    <option value={4}>alle 4 Wochen</option>
                  </select>
                  <span className="row-sep">bis</span>
                  <input id="qa-until" type="date" value={until} min={startDate}
                    onChange={e => { setTouched(true); setUntil(e.target.value); }} />
                </div>
                <p className="hint">Ohne Enddatum läuft die Serie weiter, bis du sie löschst.</p>
              </>
            )}
          </>
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

/** Short form of a rule read from the title, for the hint line. */
function repeatHint(rule: RepeatRule, startDate: string): string {
  const labels = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const days = rule.weekdays.length ? rule.weekdays : (startDate ? [weekdayOf(startDate)] : []);
  const named = days.map(d => labels[d]).join(', ');
  return rule.interval === 1 ? `wöchentlich ${named}` : `alle ${rule.interval} Wochen ${named}`;
}
