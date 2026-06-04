import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { activePaySettingsFor } from '../lib/payroll';
import { fmtChf, fmtDate, fmtNum, round2 } from '../lib/format';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ErfassungTab() {
  const { activeTab, data, user, role, members, householdId, addShift, deleteShift, primedTabs } = useApp();
  const [date, setDate] = useState(todayIso);
  const [hoursStr, setHoursStr] = useState('');
  const [note, setNote] = useState('');

  const userId = user ? user.id : null;
  const visible = role === 'employee'
    ? data.shifts.filter(e => e.entered_by === userId)
    : data.shifts;
  const showEnteredBy = role === 'owner' || role === 'admin';

  const enteredByLabel = (id: string) => {
    if (!id) return '–';
    if (id === userId) return 'Du';
    const m = members.get(id);
    if (!m) return '–';
    return m.full_name || m.email || '–';
  };

  async function onAdd() {
    const hours = Number(hoursStr);
    if (!date) { alert('Bitte ein Datum eingeben.'); return; }
    if (!hours || hours <= 0) { alert('Bitte gültige Stundenzahl eingeben.'); return; }
    if (!householdId) { alert('Nicht angemeldet.'); return; }
    await addShift({ date, hours, note: note.trim() });
    setHoursStr('');
    setNote('');
  }

  const totalH = visible.reduce((s, e) => s + e.hours, 0);
  const totalB = round2(visible.reduce((s, e) => s + e.hours * activePaySettingsFor(data, e.date).hourlyRate, 0));
  const totalColspan = showEnteredBy ? 3 : 2;

  return (
    <section id="erfassung" role="tabpanel" aria-labelledby="tab-erfassung" tabIndex={0}
      className={activeTab === 'erfassung' ? 'active' : undefined}>
      <h2>Stundenerfassung</h2>
      <div className="section-sub">Trage hier jeden Einsatz mit Datum und geleisteten Stunden ein.</div>

      <div className="card">
        <h3>Neuer Einsatz</h3>
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
            <input type="text" id="e-notiz" placeholder="z.B. Kinderbetreuung 17–21h"
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
                  {showEnteredBy && <th>Erfasst von</th>}
                  <th>Notiz</th>
                  <th className="num">Stunden</th>
                  <th className="num">Stundenlohn</th>
                  <th className="num">Betrag</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(e => {
                  const lohn = activePaySettingsFor(data, e.date).hourlyRate;
                  const betrag = round2(e.hours * lohn);
                  const canDelete = role !== 'employee' || e.entered_by === userId;
                  return (
                    <tr key={e.id}>
                      <td>{fmtDate(e.date)}</td>
                      {showEnteredBy && <td>{enteredByLabel(e.entered_by)}</td>}
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
