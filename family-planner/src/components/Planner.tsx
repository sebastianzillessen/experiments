import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient.ts';
import { useApp } from '../context/AppContext.tsx';
import {
  addDaysToKey, addMonths, dayLabel, dayLabelShort, isWeekend, monthDays, monthLabel,
  startOfMonth, startOfWeek, timeRangeLabel, timeRangeParts, todayKey, weekDays, weekLabel,
} from '../lib/dates.ts';
import { buildCells, buildSpanLanes } from '../lib/merge.ts';
import { expandManualSeries } from '../lib/recurrence.ts';
import { FAMILY_COLUMN, ROLE_LABELS } from '../lib/types.ts';
import type { SpanLane } from '../lib/merge.ts';
import type { PlannerEvent, TimeFormat } from '../lib/types.ts';
import type { ClockParts } from '../lib/dates.ts';
import type { WeatherDay } from '../lib/types.ts';
import { QuickAddSheet } from './QuickAddSheet.tsx';
import type { QuickAddPrefill } from './QuickAddSheet.tsx';
import { EventSheet } from './EventSheet.tsx';
import { SettingsScreen } from './SettingsScreen.tsx';
import { AppVersion } from './AppVersion.tsx';
import { KioskCurtain, useKiosk } from './KioskMode.tsx';
import { WeatherCell, useWeatherDetail } from './Weather.tsx';

type View = 'week' | 'month';

/** Below this width the table becomes a day-by-day list — a phone cannot show six columns. */
function useIsNarrow(): boolean {
  const query = '(max-width: 760px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (ev: MediaQueryListEvent) => setNarrow(ev.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

export function Planner() {
  const {
    family, role, people, manualSeries, calendarEvents, menuEvents, canEdit, sync,
    refreshCalendars, weather, refreshWeather,
  } = useApp();
  const tz = family?.timezone ?? 'Europe/Zurich';
  const weekStart = family?.weekStart ?? 1;
  const timeFormat = family?.timeFormat ?? '24h';

  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => todayKey(tz));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<QuickAddPrefill | null>(null);
  const [selected, setSelected] = useState<PlannerEvent | null>(null);
  const narrow = useIsNarrow();

  const days = useMemo(
    () => (view === 'week' ? weekDays(startOfWeek(anchor, weekStart)) : monthDays(anchor)),
    [view, anchor, weekStart]
  );
  const events = useMemo(
    () => [
      ...expandManualSeries(manualSeries, days[0], days[days.length - 1], tz),
      ...calendarEvents,
      ...menuEvents,
    ],
    [manualSeries, calendarEvents, menuEvents, days, tz]
  );
  const cells = useMemo(() => buildCells(days, people, events, tz), [days, people, events, tz]);
  const spans = useMemo(() => buildSpanLanes(days, people, events), [days, people, events]);
  const today = todayKey(tz);

  // The run under the pointer, by entry key. A band is one entry drawn in
  // several pieces, so hovering any piece has to light all of them and the
  // chip that names it. Read off the DOM rather than tracked per segment:
  // mouseover bubbles once on the way in, so moving along a band never
  // flickers through an unlit frame.
  const [lit, setLit] = useState<string | null>(null);
  const litFrom = (e: { target: EventTarget | null }) =>
    setLit((e.target as HTMLElement | null)?.closest<HTMLElement>('[data-span]')?.dataset.span ?? null);

  const [detailedWeather, toggleWeather] = useWeatherDetail();
  const byDate = useMemo(() => new Map(weather.map(d => [d.date, d])), [weather]);

  const backToToday = useCallback(() => { setView('week'); setAnchor(todayKey(tz)); }, [tz]);
  const pullCalendars = useCallback(() => {
    refreshCalendars(false);
    refreshWeather(false);
  }, [refreshCalendars, refreshWeather]);
  const kiosk = useKiosk(pullCalendars, backToToday);

  // Bring today into view whenever it is among the days on screen. Paging to
  // another week or month finds nothing to scroll to and is left alone.
  const tableRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const row = tableRef.current?.querySelector('.is-today');
    row?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }, [days, today, narrow, kiosk.asleep]);

  function step(delta: number) {
    setAnchor(prev => (view === 'week' ? addDaysToKey(prev, 7 * delta) : addMonths(startOfMonth(prev), delta)));
  }

  const title = view === 'week' ? weekLabel(startOfWeek(anchor, weekStart)) : monthLabel(anchor);
  const columns = [...people, { id: FAMILY_COLUMN, name: 'Familie', color: '#8a7d64' }];

  return (
    <div className="planner" ref={tableRef}>
      <header className="topbar no-print">
        <div className="topbar-left">
          <h1>{family?.name ?? 'Familienplaner'}</h1>
          {role && <span className={`role-badge ${role}`}>{ROLE_LABELS[role]}</span>}
        </div>
        <div className="topbar-right">
          <div className="segmented" role="tablist" aria-label="Ansicht">
            <button role="tab" aria-selected={view === 'week'} className={view === 'week' ? 'active' : ''}
              onClick={() => setView('week')}>Woche</button>
            <button role="tab" aria-selected={view === 'month'} className={view === 'month' ? 'active' : ''}
              onClick={() => setView('month')}>Monat</button>
          </div>
          <button className="icon-btn" title="Kalender aktualisieren" aria-label="Kalender aktualisieren"
            onClick={() => refreshCalendars(true)} disabled={sync.busy}>⟳</button>
          <button className="icon-btn" title="Einstellungen" aria-label="Einstellungen"
            onClick={() => setSettingsOpen(true)}>☰</button>
        </div>
      </header>

      <nav className="rangebar no-print">
        <button className="icon-btn" aria-label="Zurück" onClick={() => step(-1)}>‹</button>
        <button className="range-title" onClick={() => setAnchor(today)} title="Zu heute springen">{title}</button>
        <button className="icon-btn" aria-label="Weiter" onClick={() => step(1)}>›</button>
      </nav>

      {narrow ? (
        <DayList days={days} today={today} tz={tz} timeFormat={timeFormat} cells={cells} columns={columns}
          onPick={setSelected} onAdd={(day, personId) => setQuickAdd({ date: day, personId })} canEdit={canEdit}
          weatherFor={day => byDate.get(day)}
          weatherDetailed={detailedWeather} onToggleWeather={toggleWeather} />
      ) : (
        <div className="table-wrap">
          <table className="planner-table">
            <thead>
              <tr>
                <th className="col-day" scope="col">{view === 'week' ? 'Tag' : monthLabel(anchor)}</th>
                {columns.map(col => (
                  <th key={col.id} scope="col">
                    <span className="dot" style={{ background: col.color }} aria-hidden="true" />
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody onMouseOver={litFrom} onMouseLeave={() => setLit(null)}
              onFocus={litFrom} onBlur={() => setLit(null)}>
              {days.map(day => (
                <tr key={day} className={[
                  day === today ? 'is-today' : '',
                  isWeekend(day) ? 'is-weekend' : '',
                ].filter(Boolean).join(' ')}>
                  <th scope="row" className="col-day">
                    {view === 'week' ? dayLabel(day) : dayLabelShort(day)}
                    <WeatherCell day={byDate.get(day)} detailed={detailedWeather}
                      onToggle={toggleWeather} />
                  </th>
                  {columns.map(col => {
                    const bands = spans.at.get(col.id)?.get(day) ?? [];
                    // An entry drawn as a band gets its chip on the first day
                    // on screen only; the band carries the rest of the run.
                    // The chip that names a run goes to the top of the cell,
                    // where its band begins — a run that carries a time would
                    // otherwise sort below the all-day entries and hang off
                    // the middle of its own band.
                    const list = (cells.get(day)?.get(col.id) ?? [])
                      .filter(ev => (spans.spannedFrom.get(ev.key) ?? day) === day)
                      .sort((a, b) =>
                        Number(spans.spannedFrom.has(b.key)) - Number(spans.spannedFrom.has(a.key)));
                    // The chip sits against its band, so that the two read as
                    // one entry. Only the outermost band can have it: an inner
                    // one would have to reach across the bands beside it.
                    const outer = bands.length - 1;
                    const glued = bands[outer]?.first ? bands[outer]!.event.key : null;
                    return (
                      <td key={col.id}>
                        <div className="cell-row">
                          {bands.length > 0 && (
                            <div className="cell-bands">
                              {bands.map((lane, i) => (lane
                                ? <SpanBand key={lane.event.key} lane={lane}
                                    glued={lane.event.key === glued} lit={lit === lane.event.key}
                                    onClick={() => setSelected(lane.event)} />
                                : <span key={`gap${i}`} className="band-gap" />))}
                            </div>
                          )}
                          <div className="cell">
                            {list.map(ev => (
                              <EventChip key={ev.key + day} event={ev} tz={tz} timeFormat={timeFormat}
                                span={spanMarker(bands, ev)} glued={ev.key === glued}
                                lit={lit === ev.key} onClick={() => setSelected(ev)} />
                            ))}
                            {canEdit && (
                              <button className="cell-add" aria-label={`Eintrag am ${dayLabel(day)} für ${col.name}`}
                                onClick={() => setQuickAdd({ date: day, personId: col.id === FAMILY_COLUMN ? null : col.id })}>
                                ＋
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="userbar no-print">
        <span>{family?.name}</span>
        <AppVersion />
        <button className="linklike" onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </footer>

      {canEdit && (
        <button className="fab no-print" aria-label="Neuer Eintrag"
          onClick={() => setQuickAdd({ date: today >= days[0] && today <= days[days.length - 1] ? today : days[0], personId: null })}>
          ＋
        </button>
      )}

      {quickAdd && <QuickAddSheet prefill={quickAdd} onClose={() => setQuickAdd(null)} />}
      {selected && <EventSheet event={selected} onClose={() => setSelected(null)} />}
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
      {kiosk.asleep && <KioskCurtain onWake={kiosk.wake} />}
    </div>
  );
}

/**
 * The band that carries a multi-day entry down its column.
 *
 * It bleeds over the cell padding and the rule between the rows, so the
 * segments of consecutive days meet and read as one object rather than as the
 * same chip printed again and again. Square where the run leaves the days on
 * screen, rounded where it really begins and ends.
 */
/** Which way the run leaves the chip: down, or in from before and on. */
function spanMarker(lanes: (SpanLane | null)[] | undefined, event: PlannerEvent): string | undefined {
  const lane = lanes?.find(l => l?.event.key === event.key);
  if (!lane) return undefined;
  return lane.openStart ? '↕' : '↓';
}

function SpanBand({ lane, glued, lit, onClick }: {
  lane: SpanLane; glued: boolean; lit: boolean; onClick: () => void;
}) {
  const { event, first, last, openStart, openEnd } = lane;
  const classes = [
    'band',
    first && !openStart ? 'band-start' : '',
    last && !openEnd ? 'band-end' : '',
    // Square where the chip is about to be set against it.
    glued && first ? 'band-glued' : '',
    lit ? 'is-lit' : '',
  ].filter(Boolean).join(' ');
  return (
    <button className={classes} onClick={onClick} data-span={event.key}
      style={{ background: event.source === 'manual' ? 'var(--accent)' : event.color }}
      title={event.title} aria-label={event.title} />
  );
}

function EventChip({ event, tz, timeFormat, span, glued, lit, onClick }: {
  event: PlannerEvent; tz: string; timeFormat: TimeFormat;
  span?: string; glued?: boolean; lit?: boolean; onClick: () => void;
}) {
  const parts = event.allDay ? null : timeRangeParts(event.startsAt, event.endsAt, tz, timeFormat);
  // The plain form is what a screen reader should hear, and what the tooltip
  // shows: "16⁰⁰" is a shape for the eye, not something to read aloud.
  const spoken = event.allDay ? '' : timeRangeLabel(event.startsAt, event.endsAt, tz, timeFormat);
  return (
    <button
      className={['chip', event.source, glued ? 'chip-glued' : '', lit ? 'is-lit' : '']
        .filter(Boolean).join(' ')}
      style={event.source !== 'manual' ? { borderLeftColor: event.color } : undefined}
      onClick={onClick}
      data-span={span ? event.key : undefined}
      title={spoken ? `${spoken} ${event.title}` : event.title}
      aria-label={spoken ? `${spoken} ${event.title}` : event.title}
    >
      {parts && (
        <span className="chip-time" aria-hidden="true">
          <Clock parts={parts.start} />
          {parts.end && <>–<Clock parts={parts.end} /></>}
        </span>
      )}
      <span className="chip-title">{event.displayTitle || event.title}</span>
      {event.repeat && <span className="chip-repeat" aria-label="wiederholt sich">↻</span>}
      {span && <span className="chip-span" aria-hidden="true">{span}</span>}
    </button>
  );
}

/** Hour on the baseline, minutes raised — the timetable setting. */
function Clock({ parts }: { parts: ClockParts }) {
  return (
    <>
      {parts.hour}<sup>{parts.minute}</sup>{parts.suffix && <> {parts.suffix}</>}
    </>
  );
}

type Column = { id: string; name: string; color: string };

/** Phone layout: one card per day, the people inside it. */
function DayList({
  days, today, tz, timeFormat, cells, columns, onPick, onAdd, canEdit,
  weatherFor, weatherDetailed, onToggleWeather,
}: {
  days: string[];
  today: string;
  tz: string;
  timeFormat: TimeFormat;
  cells: Map<string, Map<string, PlannerEvent[]>>;
  columns: Column[];
  onPick: (ev: PlannerEvent) => void;
  onAdd: (day: string, personId: string | null) => void;
  canEdit: boolean;
  weatherFor: (day: string) => WeatherDay | undefined;
  weatherDetailed: boolean;
  onToggleWeather: () => void;
}) {
  return (
    <div className="day-list">
      {days.map(day => {
        const row = cells.get(day);
        const filled = columns.filter(col => (row?.get(col.id) ?? []).length > 0);
        return (
          <section key={day} className={`day-card${day === today ? ' is-today' : ''}${isWeekend(day) ? ' is-weekend' : ''}`}>
            <h2>
              <span className="day-card-title">
                {dayLabel(day)}
                <WeatherCell day={weatherFor(day)} detailed={weatherDetailed}
                  onToggle={onToggleWeather} />
              </span>
              {canEdit && (
                <button className="linklike" onClick={() => onAdd(day, null)} aria-label={`Eintrag am ${dayLabel(day)}`}>＋</button>
              )}
            </h2>
            {filled.length === 0 && <p className="muted empty">nichts geplant</p>}
            {filled.map(col => (
              <div key={col.id} className="day-person">
                <span className="person-tag">
                  <span className="dot" style={{ background: col.color }} aria-hidden="true" />
                  {col.name}
                </span>
                <div className="cell">
                  {(row?.get(col.id) ?? []).map(ev => (
                    <EventChip key={ev.key + day} event={ev} tz={tz} timeFormat={timeFormat}
                      onClick={() => onPick(ev)} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
