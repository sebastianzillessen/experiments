import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { activeEmployees, activeWageFor, employeeById, employeeName, ownEmployee } from '../lib/payroll';
import { fmtChf, fmtDate, fmtNum, round2 } from '../lib/format';
import { EmployeeTutorial } from '../components/Onboarding';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ErfassungTab() {
  const {
    activeTab, data, user, role, householdId, addShift, deleteShift, primedTabs,
    selectedEmployeeId, setSelectedEmployeeId
  } = useApp();
  const [date, setDate] = useState(todayIso);
  const [hoursStr, setHoursStr] = useState('');
  const [note, setNote] = useState('');

  const userId = user ? user.id : null;
  const own = ownEmployee(data, userId);
  const actives = activeEmployees(data);

  // Employee chooser for the "new shift" form. Hidden when an employee role is
  // logged in (pinned to themselves) or the household has only one employee.
  const showChooser = role !== 'employee' && actives.length > 1;

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
    await addShift({ date, hours, note: note.trim(), employeeId: employeeId! });
    setHoursStr('');
    setNote('');
  }

  const totalH = visible.reduce((s, e) => s + e.hours, 0);
  const totalB = round2(visible.reduce((s, e) => s + e.hours * (e.employeeId ? activeWageFor(data, e.employeeId, e.date) : 0), 0));
  const totalColspan = showEmployee ? 3 : 2;

  return (
    <section id="erfassung" role="tabpanel" aria-labelledby="tab-erfassung" tabIndex={0}
      className={activeTab === 'erfassung' ? 'active' : undefined}>
      <h2>Stundenerfassung</h2>
      <div className="section-sub">Trage hier jeden Einsatz mit Datum und geleisteten Stunden ein.</div>

      <EmployeeTutorial />

      <div className="card">
        <h3>Neuer Einsatz</h3>
        <div id="e-employee-wrap" hidden={!showChooser} style={{ marginBottom: 12 }}>
          <label htmlFor="e-employee">Mitarbeiter/in</label>
          <select id="e-employee" value={selectedEmployeeId || ''}
            onChange={e => setSelectedEmployeeId(e.target.value || null)}>
            {actives.map(e => (
              <option key={e.id} value={e.id!}>{employeeName(e)}</option>
            ))}
          </select>
        </div>
        <div className="grid-3">
          <div>
            <label htmlFor="e-datum">Datum</label>
            <input type="date" id="e-datum" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="e-stunden">Stunden</label>
            <input type="number" id="e-stunden" step="0.25" min="0" placeholder="z.B. 4.5"
              value={hoursStr} onChange={e => setHoursStr(e.target.value)} />
          </div>
          <div>
            <label htmlFor="e-notiz">Notiz (optional)</label>
            <input type="text" id="e-notiz" placeholder="z.B. Reinigung 14–17 Uhr"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <div className="btn-row">
          <button className="btn" id="btn-add" onClick={onAdd}>Einsatz hinzufügen</button>
        </div>
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
                  const lohn = e.employeeId ? activeWageFor(data, e.employeeId, e.date) : 0;
                  const betrag = round2(e.hours * lohn);
                  const canDelete = role !== 'employee' || (own && e.employeeId === own.id) || e.entered_by === userId;
                  return (
                    <tr key={e.id}>
                      <td>{fmtDate(e.date)}</td>
                      {showEmployee && <td>{empLabel(e.employeeId)}</td>}
                      <td>{e.note ? e.note : <span className="muted">–</span>}</td>
                      <td className="num">{fmtNum(e.hours)}</td>
                      <td className="num">CHF {fmtChf(lohn)}</td>
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
