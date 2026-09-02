import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient.ts';
import { useApp } from '../context/AppContext.tsx';
import {
  addDaysToKey, addMonths, dayLabel, dayLabelShort, isWeekend, monthDays, monthLabel,
  startOfMonth, startOfWeek, timeRangeLabel, todayKey, weekDays, weekLabel,
} from '../lib/dates.ts';
import { buildCells } from '../lib/merge.ts';
import { FAMILY_COLUMN, ROLE_LABELS } from '../lib/types.ts';
import type { PlannerEvent } from '../lib/types.ts';
import { QuickAddSheet } from './QuickAddSheet.tsx';
import type { QuickAddPrefill } from './QuickAddSheet.tsx';
import { EventSheet } from './EventSheet.tsx';
import { SettingsScreen } from './SettingsScreen.tsx';
import { AppVersion } from './AppVersion.tsx';

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
  const { family, role, people, events, canEdit, sync, refreshCalendars } = useApp();
  const tz = family?.timezone ?? 'Europe/Zurich';
  const weekStart = family?.weekStart ?? 1;

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
  const cells = useMemo(() => buildCells(days, people, events), [days, people, events]);
  const today = todayKey(tz);

  function step(delta: number) {
    setAnchor(prev => (view === 'week' ? addDaysToKey(prev, 7 * delta) : addMonths(startOfMonth(prev), delta)));
  }

  const title = view === 'week' ? weekLabel(startOfWeek(anchor, weekStart)) : monthLabel(anchor);
  const columns = [...people, { id: FAMILY_COLUMN, name: 'Familie', color: '#8a7d64' }];

  return (
    <div className="planner">
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

      {sync.error && <div className="notice danger no-print">{sync.error}</div>}
      {sync.busy && <div className="notice info no-print">Kalender werden abgerufen …</div>}

      {narrow ? (
        <DayList days={days} today={today} tz={tz} cells={cells} columns={columns}
          onPick={setSelected} onAdd={(day, personId) => setQuickAdd({ date: day, personId })} canEdit={canEdit} />
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
            <tbody>
              {days.map(day => (
                <tr key={day} className={[
                  day === today ? 'is-today' : '',
                  isWeekend(day) ? 'is-weekend' : '',
                ].filter(Boolean).join(' ')}>
                  <th scope="row" className="col-day">
                    {view === 'week' ? dayLabel(day) : dayLabelShort(day)}
                  </th>
                  {columns.map(col => (
                    <td key={col.id}>
                      <div className="cell">
                        {(cells.get(day)?.get(col.id) ?? []).map(ev => (
                          <EventChip key={ev.key + day} event={ev} tz={tz} onClick={() => setSelected(ev)} />
                        ))}
                        {canEdit && (
                          <button className="cell-add" aria-label={`Eintrag am ${dayLabel(day)} für ${col.name}`}
                            onClick={() => setQuickAdd({ date: day, personId: col.id === FAMILY_COLUMN ? null : col.id })}>
                            ＋
                          </button>
                        )}
                      </div>
                    </td>
                  ))}
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
    </div>
  );
}

function EventChip({ event, tz, onClick }: { event: PlannerEvent; tz: string; onClick: () => void }) {
  const time = event.allDay ? '' : timeRangeLabel(event.startsAt, event.endsAt, tz);
  return (
    <button className={`chip ${event.source}`} onClick={onClick} title={event.notes || event.title}>
      <span className="dot" style={{ background: event.color }} aria-hidden="true" />
      {time && <span className="chip-time">{time}</span>}
      <span className="chip-title">{event.title}</span>
    </button>
  );
}

type Column = { id: string; name: string; color: string };

/** Phone layout: one card per day, the people inside it. */
function DayList({ days, today, tz, cells, columns, onPick, onAdd, canEdit }: {
  days: string[];
  today: string;
  tz: string;
  cells: Map<string, Map<string, PlannerEvent[]>>;
  columns: Column[];
  onPick: (ev: PlannerEvent) => void;
  onAdd: (day: string, personId: string | null) => void;
  canEdit: boolean;
}) {
  return (
    <div className="day-list">
      {days.map(day => {
        const row = cells.get(day);
        const filled = columns.filter(col => (row?.get(col.id) ?? []).length > 0);
        return (
          <section key={day} className={`day-card${day === today ? ' is-today' : ''}${isWeekend(day) ? ' is-weekend' : ''}`}>
            <h2>
              {dayLabel(day)}
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
                    <EventChip key={ev.key + day} event={ev} tz={tz} onClick={() => onPick(ev)} />
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
