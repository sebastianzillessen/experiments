import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { activeEmployees, activeMonthlySalaryFor, activeWageFor, employeeById, employeeName, ownEmployee } from '../lib/payroll';
import { fmtChf, fmtDate, fmtNum, hoursBetweenTimes, monthLabel, round2, shiftNoteLabel } from '../lib/format';
import { normalizeEffectiveMonth } from '../lib/state';
import { EmployeeTutorial } from '../components/Onboarding';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function ErfassungTab() {
  const {
    activeTab, data, user, role, householdId, addShift, deleteShift, primedTabs,
    selectedEmployeeId, setSelectedEmployeeId
  } = useApp();
  const [date, setDate] = useState(todayIso);
  const [hoursStr, setHoursStr] = useState('');
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [note, setNote] = useState('');
  const [monthStr, setMonthStr] = useState(currentMonth);

  // Von/Bis are a convenience: whenever both are set we fill the Stunden field
  // automatically (still editable, so a manual number keeps working too).
  function updateFromTime(v: string) {
    setFromTime(v);
    const h = hoursBetweenTimes(v, toTime);
    if (h != null) setHoursStr(String(h));
  }
  function updateToTime(v: string) {
    setToTime(v);
    const h = hoursBetweenTimes(fromTime, v);
    if (h != null) setHoursStr(String(h));
  }
  const computedHours = hoursBetweenTimes(fromTime, toTime);

  const userId = user ? user.id : null;
  const own = ownEmployee(data, userId);
  const actives = activeEmployees(data);

  // Employee chooser for the "new shift" form. Hidden when an employee role is
  // logged in (pinned to themselves) or the household has only one employee.
  const showChooser = role !== 'employee' && actives.length > 1;

  // The employee the entry form currently targets (drives hourly vs. Monatslohn UI).
  const formEmp = role === 'employee'
    ? own
    : (employeeById(data, selectedEmployeeId) || (actives.length === 1 ? actives[0] : null));
  const formMonthly = formEmp?.data.employmentType === 'monthly';

  // Employee role: only their own shifts (by linked employee, or self-entered).
  const visible = role === 'employee'
    ? data.shifts.filter(e => (own && e.employeeId === own.id) || e.entered_by === userId)
    : data.shifts;

  const isAdmin = role === 'owner' || role === 'admin';
  const showEmployee = isAdmin && actives.length > 1;
  const empLabel = (id: string | null) => {
    const emp = employeeById(data, id);
    return emp ? employeeName(emp) : '–';
  };

  async function onAdd() {
    const hours = Number(hoursStr);
    if (!date) { alert('Bitte ein Datum eingeben.'); return; }
    if (!hours || hours <= 0) { alert('Bitte gültige Stundenzahl eingeben.'); return; }
    if (!householdId) { alert('Nicht angemeldet.'); return; }

    if (!actives.length) { alert('Bitte zuerst unter „Mitarbeitende" eine Person anlegen.'); return; }
    // Determine the employee the shift belongs to.
    let employeeId: string | null;
    if (role === 'employee') {
      if (!own) {
        alert('Dein Login ist noch keiner/keinem Mitarbeitenden zugeordnet. Bitte wende dich an die Verwaltung des Haushalts.');
        return;
      }
      employeeId = own.id;
    } else {
      employeeId = selectedEmployeeId || (actives.length === 1 ? actives[0].id : null);
      if (!employeeId) { alert('Bitte zuerst eine/n Mitarbeiter/in auswählen.'); return; }
    }
    // Persist the raw Von/Bis only when both are set (so the overview can show
    // the range); hours stays the authoritative figure either way.
    const bothTimes = fromTime && toTime;
    await addShift({
      date, hours, note: note.trim(), employeeId: employeeId!,
      startTime: bothTimes ? fromTime : null,
      endTime: bothTimes ? toTime : null
    });
    setHoursStr('');
    setFromTime('');
    setToTime('');
    setNote('');
  }

  // Monatslohn: confirm a month (a NULL-hours marker shift). No hours entry.
  async function onAddMonth() {
    if (!householdId) { alert('Nicht angemeldet.'); return; }
    const month = normalizeEffectiveMonth(monthStr);
    if (!month) { alert('Bitte einen gültigen Monat wählen.'); return; }
    const employeeId = formEmp?.id ?? null;
    if (!employeeId) { alert('Bitte zuerst eine/n Mitarbeiter/in auswählen.'); return; }
    if (data.shifts.some(s => s.employeeId === employeeId && s.date === month)) {
      alert('Dieser Monat wurde für diese Person bereits erfasst.');
      return;
    }
    await addShift({ date: month, hours: null, note: note.trim(), employeeId });
    setNote('');
  }

  // Hours sum ignores Monatslohn markers (hours === null); Betrag includes both
  // hourly amounts and monthly salaries.
  const totalH = visible.reduce((s, e) => s + (e.hours ?? 0), 0);
  const totalB = round2(visible.reduce((s, e) => {
    if (e.hours == null) return s + (e.employeeId ? activeMonthlySalaryFor(data, e.employeeId, e.date) : 0);
    return s + e.hours * (e.employeeId ? activeWageFor(data, e.employeeId, e.date) : 0);
  }, 0));
  const totalColspan = showEmployee ? 3 : 2;

  return (
    <section id="erfassung" role="tabpanel" aria-labelledby="tab-erfassung" tabIndex={0}
      className={activeTab === 'erfassung' ? 'active' : undefined}>
      <h2>Stundenerfassung</h2>
      <div className="section-sub">Trage hier jeden Einsatz ein: Datum und Arbeitszeit von–bis — die Stunden werden automatisch berechnet. Eine Notiz ist optional.</div>

      <EmployeeTutorial />

      <div className="card">
        <h3>{formMonthly ? 'Monat erfassen' : 'Neuer Einsatz'}</h3>
        <div id="e-employee-wrap" hidden={!showChooser} style={{ marginBottom: 12 }}>
          <label htmlFor="e-employee">Mitarbeiter/in</label>
          <select id="e-employee" value={selectedEmployeeId || ''}
            onChange={e => setSelectedEmployeeId(e.target.value || null)}>
            {actives.map(e => (
              <option key={e.id} value={e.id!}>{employeeName(e)}</option>
            ))}
          </select>
        </div>
        {formMonthly ? (
          <>
            <div className="info" style={{ marginBottom: 12 }}>Monatslohn-Anstellung: bestätige den Monat, der abgerechnet werden soll. Es werden keine Stunden erfasst.</div>
            <div className="grid-3">
              <div>
                <label htmlFor="e-monat">Monat</label>
                <input type="month" id="e-monat" value={monthStr} onChange={e => setMonthStr(e.target.value)} />
              </div>
              <div>
                <label htmlFor="e-notiz-m">Notiz (optional)</label>
                <input type="text" id="e-notiz-m" placeholder="z.B. Vollzeit"
                  value={note} onChange={e => setNote(e.target.value)} />
              </div>
            </div>
            <div className="btn-row">
              <button className="btn" id="btn-add-month" onClick={onAddMonth}>Monat bestätigen</button>
            </div>
          </>
        ) : (
          <>
            <div className="grid-3">
              <div>
                <label htmlFor="e-datum">Datum</label>
                <input type="date" id="e-datum" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div>
                <label htmlFor="e-von">Von</label>
                <input type="time" id="e-von" step="300" value={fromTime}
                  onChange={e => updateFromTime(e.target.value)} />
              </div>
              <div>
                <label htmlFor="e-bis">Bis</label>
                <input type="time" id="e-bis" step="300" value={toTime}
                  onChange={e => updateToTime(e.target.value)} />
              </div>
            </div>
            <div className="grid-2" style={{ marginTop: 12 }}>
              <div>
                <label htmlFor="e-stunden">Stunden</label>
                <input type="number" id="e-stunden" step="0.25" min="0" placeholder="z.B. 4.5"
                  value={hoursStr} onChange={e => setHoursStr(e.target.value)} />
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {computedHours != null
                    ? `Aus Von/Bis berechnet: ${fmtNum(computedHours)} Std. — du kannst sie auch direkt anpassen.`
                    : 'Wird aus Von/Bis automatisch berechnet — oder direkt eintragen.'}
                </div>
              </div>
              <div>
                <label htmlFor="e-notiz">Notiz <span className="muted" style={{ fontWeight: 400 }}>— optional</span></label>
                <input type="text" id="e-notiz" placeholder="z.B. Spielplatz, Znacht kochen"
                  value={note} onChange={e => setNote(e.target.value)} />
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Freitext für dich — für die Abrechnung nicht nötig. Die Zeiten gehören oben in „Von“ und „Bis“.
                </div>
              </div>
            </div>
            <div className="btn-row">
              <button className="btn" id="btn-add" onClick={onAdd}>Einsatz hinzufügen</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3>Erfasste Einsätze</h3>
        <div id="entries-list">
          {!primedTabs.has('erfassung') ? null : !visible.length ? (
            <div className="empty-state">Noch keine Einsätze erfasst.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  {showEmployee && <th>Mitarbeiter/in</th>}
                  <th>Notiz</th>
                  <th className="num">Stunden</th>
                  <th className="num">Stundenlohn</th>
                  <th className="num">Betrag</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(e => {
                  const isMonth = e.hours == null;
                  const lohn = (!isMonth && e.employeeId) ? activeWageFor(data, e.employeeId, e.date) : 0;
                  const betrag = isMonth
                    ? (e.employeeId ? activeMonthlySalaryFor(data, e.employeeId, e.date) : 0)
                    : round2((e.hours ?? 0) * lohn);
                  const canDelete = role !== 'employee' || (own && e.employeeId === own.id) || e.entered_by === userId;
                  const noteLabel = shiftNoteLabel(e.startTime, e.endTime, e.note);
                  return (
                    <tr key={e.id}>
                      <td>{isMonth ? monthLabel(e.date.slice(0, 7)) : fmtDate(e.date)}</td>
                      {showEmployee && <td>{empLabel(e.employeeId)}</td>}
                      <td>{noteLabel ? noteLabel : <span className="muted">–</span>}</td>
                      <td className="num">{isMonth ? 'Monat' : fmtNum(e.hours ?? 0)}</td>
                      <td className="num">{isMonth ? '–' : `CHF ${fmtChf(lohn)}`}</td>
                      <td className="num">CHF {fmtChf(betrag)}</td>
                      <td className="actions">
                        {canDelete && (
                          <button className="btn btn-small btn-danger" data-del={e.id}
                            onClick={async () => {
                              if (!confirm('Eintrag wirklich löschen?')) return;
                              await deleteShift(e.id);
                            }}>
                            Löschen
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td colSpan={totalColspan}>Total</td>
                  <td className="num">{fmtNum(totalH)}</td>
                  <td></td>
                  <td className="num">CHF {fmtChf(totalB)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
