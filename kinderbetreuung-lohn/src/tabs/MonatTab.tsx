import { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  activeMonthlySalaryFor, activePaySettingsFor, activeWageFor, berechneAbrechnung, employeeById, employeeName
} from '../lib/payroll';
import { fmtChf, fmtDate, fmtNum, monthLabel, round2, shiftNoteLabel } from '../lib/format';
import { ausgleichskasseLabel } from '../lib/cantons';
import { vacationPercentForWeeks } from '../lib/state';
import type { AppState, Employee, Shift } from '../lib/state';
import { QrBillSection } from '../lib/qrbill';
import type { QrTracker } from '../lib/qrbill';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// Employees relevant to the reports: all active ones, plus any archived ones
// that still have shifts — so an archived person's historic Abrechnungen stay
// viewable/printable (the Mitarbeitende tab promises this). Insertion order.
export function reportableEmployees(state: AppState): Employee[] {
  const withShifts = new Set(state.shifts.map(s => s.employeeId).filter(Boolean));
  return state.employees.filter(e => !e.archivedAt || withShifts.has(e.id));
}

export function monthShiftsFor(state: AppState, empId: string | null, yyyymm: string): Shift[] {
  return state.shifts.filter(e => e.employeeId === empId && e.date.startsWith(yyyymm));
}

export function Lohnabrechnung({ data, eintraege, yyyymm, employee, tracker }: {
  data: AppState; eintraege: Shift[]; yyyymm: string; employee: Employee | null; tracker: QrTracker;
}) {
  const er = data.employer;
  const ee = employee?.data ?? null;
  const empId = (employee && employee.id) ? employee.id : null;
  const isMonthly = ee?.employmentType === 'monthly';
  const calc = berechneAbrechnung(data, eintraege, employee);

  if (!eintraege.length) {
    return (
      <div className="empty-state">
        {isMonthly ? 'Monat noch nicht erfasst' : 'Keine Einsätze'} in {monthLabel(yyyymm)}{employee ? ` für ${employeeName(employee)}` : ''}.
      </div>
    );
  }

  // Use the rates of the latest entry in the period for label percentages.
  // Per-entry amounts in `calc` are correct even if rates vary within a month.
  const sorted = [...eintraege].sort((a, b) => a.date.localeCompare(b.date));
  const refDate = sorted[sorted.length - 1].date;
  const e = activePaySettingsFor(data, refDate);
  const monthlySalary = (isMonthly && empId) ? activeMonthlySalaryFor(data, empId, refDate) : 0;

  return (
    <div className="print-doc">
      <div className="doc-header">
        <div className="party">
          <div className="label-small">Arbeitgeber/in</div>
          <div className="name">{er.name || <span className="muted">(Stammdaten ergänzen)</span>}</div>
          <div>{er.address}</div>
          {(er.zip || er.city) ? <div>{`${er.zip} ${er.city}`.trim()}</div> : null}
          {er.billingNumber ? <div className="muted">SVA-Abr.-Nr.: {er.billingNumber}</div> : null}
        </div>
        <div className="party" style={{ textAlign: 'right' }}>
          <div className="label-small">Arbeitnehmer/in</div>
          <div className="name">{ee?.name || <span className="muted">(Stammdaten ergänzen)</span>}</div>
          <div>{ee?.address}</div>
          {(ee?.zip || ee?.city) ? <div>{`${ee!.zip} ${ee!.city}`.trim()}</div> : null}
          {ee?.ahvNumber ? <div className="muted">AHV-Nr.: {ee.ahvNumber}</div> : null}
        </div>
      </div>

      <div className="doc-title">
        <h1>Lohnabrechnung Privathaushalt</h1>
        <div className="period">{monthLabel(yyyymm)}</div>
      </div>

      {isMonthly ? (
        <>
          <h4>Monatslohn</h4>
          <table>
            <thead>
              <tr><th>Periode</th><th>Notiz</th><th className="num">Monatslohn</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>{monthLabel(yyyymm)}</td>
                <td>{sorted.find(x => x.note)?.note ?? ''}</td>
                <td className="num">CHF {fmtChf(monthlySalary)}</td>
              </tr>
            </tbody>
          </table>

          <h4>Bruttolohn</h4>
          <div className="summary-row"><span>Monatslohn (Ferien &amp; Feiertage inbegriffen)</span><span>CHF {fmtChf(calc.bruttoStunden)}</span></div>
          <div className="summary-row total"><span>Bruttolohn</span><span>CHF {fmtChf(calc.bruttoTotal)}</span></div>
        </>
      ) : (
        <>
          <h4>Geleistete Stunden</h4>
          <table>
            <thead>
              <tr><th>Datum</th><th>Notiz</th><th className="num">Stunden</th><th className="num">Stundenlohn</th><th className="num">Betrag</th></tr>
            </thead>
            <tbody>
              {sorted.map(x => {
                const rate = empId ? activeWageFor(data, empId, x.date) : 0;
                const hrs = x.hours ?? 0;
                return (
                  <tr key={x.id}>
                    <td>{fmtDate(x.date)}</td>
                    <td>{shiftNoteLabel(x.startTime, x.endTime, x.note)}</td>
                    <td className="num">{fmtNum(hrs)}</td>
                    <td className="num">CHF {fmtChf(rate)}</td>
                    <td className="num">CHF {fmtChf(round2(hrs * rate))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row"><td colSpan={2}>Total</td><td className="num">{fmtNum(calc.stundenTotal)}</td><td></td><td className="num">CHF {fmtChf(calc.bruttoStunden)}</td></tr>
            </tfoot>
          </table>

          <h4>Bruttolohn</h4>
          <div className="summary-row"><span>Stundenlohn-Summe</span><span>CHF {fmtChf(calc.bruttoStunden)}</span></div>
          <div className="summary-row"><span>+ Ferienzulage ({ee?.vacationWeeks} Wochen, {vacationPercentForWeeks(ee?.vacationWeeks ?? 4)} %)</span><span>CHF {fmtChf(calc.ferienzulage)}</span></div>
          <div className="summary-row"><span>+ Feiertagszulage ({e.holidayPercent} %)</span><span>CHF {fmtChf(calc.feiertagszulage)}</span></div>
          <div className="summary-row total"><span>Bruttolohn</span><span>CHF {fmtChf(calc.bruttoTotal)}</span></div>
        </>
      )}

      <h4>Abzüge Arbeitnehmer/in</h4>
      <div className="summary-row"><span>– AHV/IV/EO ({e.ahvIvEoEmployee} %)</span><span>CHF {fmtChf(calc.an.ahvIvEo)}</span></div>
      <div className="summary-row"><span>– ALV ({e.alvEmployee} %)</span><span>CHF {fmtChf(calc.an.alv)}</span></div>
      {calc.nbuApplicable && (
        <div className="summary-row"><span>– UVG-NBU ({e.uvgNbuEmployee} %)</span><span>CHF {fmtChf(calc.an.nbu)}</span></div>
      )}
      <div className="summary-row"><span>– Quellensteuer ({e.withholdingTax} %)</span><span>CHF {fmtChf(calc.an.quellenst)}</span></div>
      <div className="summary-row total"><span>Total Abzüge</span><span>CHF {fmtChf(calc.an.total)}</span></div>

      <div className="summary-row netto"><span>Auszahlung netto</span><span>CHF {fmtChf(calc.netto)}</span></div>

      <h4>Arbeitgeberbeiträge (informativ, nicht vom Lohn abgezogen)</h4>
      <div className="summary-row"><span>AHV/IV/EO ({e.ahvIvEoEmployer} %)</span><span>CHF {fmtChf(calc.ag.ahvIvEo)}</span></div>
      <div className="summary-row"><span>ALV ({e.alvEmployer} %)</span><span>CHF {fmtChf(calc.ag.alv)}</span></div>
      <div className="summary-row"><span>FAK ({e.fakEmployer} %)</span><span>CHF {fmtChf(calc.ag.fak)}</span></div>
      {calc.uvgAktivAny && (
        <div className="summary-row"><span>UVG-BU ({e.uvgBuEmployer} %)</span><span>CHF {fmtChf(calc.ag.bu)}</span></div>
      )}
      <div className="summary-row"><span>Verwaltungskosten ({e.adminFeeEmployer} % der AHV/IV/EO-Beiträge)</span><span>CHF {fmtChf(calc.ag.verw)}</span></div>
      <div className="summary-row total"><span>Total Arbeitgeberbeiträge</span><span>CHF {fmtChf(calc.ag.total)}</span></div>
      <div className="summary-row total"><span>Total Arbeitgeberkosten (Brutto + AG-Beiträge)</span><span>CHF {fmtChf(calc.agKostenTotal)}</span></div>

      <div className="footnote">
        Vereinfachtes Abrechnungsverfahren der {ausgleichskasseLabel(er.canton)} ({e.uvgEnabled ? 'VAVplus' : 'VAV'}). Quellensteuer und Sozialversicherungsbeiträge werden direkt mit der Ausgleichskasse abgerechnet. {e.uvgEnabled ? `Unfallversicherung über ${ausgleichskasseLabel(er.canton)}.` : 'Unfallversicherung separat über privaten Versicherer.'}
      </div>

      <div className="signatures">
        <div className="sig">Ort, Datum &amp; Unterschrift Arbeitgeber/in</div>
        <div className="sig">Ort, Datum &amp; Unterschrift Arbeitnehmer/in (Empfangsbestätigung)</div>
      </div>
      {ee?.iban ? (
        <QrBillSection ee={ee} er={er} yyyymm={yyyymm} netto={calc.netto}
          slotId={`qr-bill-slot-${empId}`} tracker={tracker} />
      ) : null}
    </div>
  );
}

// Scope selector shared by the report tabs (Alle + each relevant employee).
// Visible only for admins with more than one relevant employee.
export function ReportEmployeeSelect({ wrapId, selId, data, role, value, onChange }: {
  wrapId: string; selId: string; data: AppState; role: string | null; value: string; onChange: (v: string) => void;
}) {
  const reportable = reportableEmployees(data);
  const show = role !== 'employee' && reportable.length > 1;
  const effective = reportable.some(e => e.id === value) ? value : '';
  return (
    <div id={wrapId} hidden={!show}>
      <label htmlFor={selId}>Mitarbeiter/in</label>
      <select id={selId} value={effective} onChange={e => onChange(e.target.value)}>
        <option value="">Alle Mitarbeitenden</option>
        {reportable.map(e => (
          <option key={e.id} value={e.id!}>{employeeName(e)}{e.archivedAt ? ' (archiviert)' : ''}</option>
        ))}
      </select>
    </div>
  );
}

// Scope for the report tabs. An employee role is pinned to their own record;
// with a single relevant employee there is no chooser; otherwise the selector
// offers "Alle" (combined) plus each employee.
export function reportScope(data: AppState, role: string | null, ownId: string | null, selValue: string):
  { mode: 'one'; emp: Employee | null } | { mode: 'all'; emps: Employee[] } {
  if (role === 'employee') {
    return { mode: 'one', emp: data.employees.find(e => e.id === ownId) || null };
  }
  const reportable = reportableEmployees(data);
  if (reportable.length <= 1) return { mode: 'one', emp: reportable[0] || null };
  if (!selValue || !reportable.some(e => e.id === selValue)) return { mode: 'all', emps: reportable };
  return { mode: 'one', emp: employeeById(data, selValue) };
}

export function MonatTab() {
  const { activeTab, data, role, user } = useApp();
  const [month, setMonth] = useState(currentMonth);
  const [empSel, setEmpSel] = useState('');
  // Counts in-flight QR-bill generations so printing can wait for a stable DOM.
  const qrTracker = useRef<QrTracker>({ pending: 0 });

  const ownId = data.employees.find(e => e.userId && e.userId === user?.id)?.id ?? null;
  const scope = reportScope(data, role, ownId, empSel);

  async function onPrint() {
    // Wait for the QR-bill to finish injecting so the print preview isn't
    // mutated (and blanked) mid-print.
    const deadline = Date.now() + 3000;
    while (qrTracker.current.pending > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 50));
    }
    window.print();
  }

  let doc = null;
  if (month) {
    if (scope.mode === 'one') {
      if (!scope.emp) {
        doc = <div className="empty-state">Bitte zuerst unter „Mitarbeitende" eine Person anlegen.</div>;
      } else {
        doc = (
          <Lohnabrechnung data={data} eintraege={monthShiftsFor(data, scope.emp.id, month)}
            yyyymm={month} employee={scope.emp} tracker={qrTracker.current} />
        );
      }
    } else {
      // "Alle": one combined document, one payslip per employee (page break each).
      const emps = scope.emps.filter(e => monthShiftsFor(data, e.id, month).length);
      doc = !emps.length ? (
        <div className="empty-state">Keine Einsätze in {monthLabel(month)} erfasst.</div>
      ) : (
        <>
          {emps.map(emp => (
            <div className="employee-doc" key={emp.id}>
              <Lohnabrechnung data={data} eintraege={monthShiftsFor(data, emp.id, month)}
                yyyymm={month} employee={emp} tracker={qrTracker.current} />
            </div>
          ))}
        </>
      );
    }
  }

  return (
    <section id="monat" role="tabpanel" aria-labelledby="tab-monat" tabIndex={0}
      className={activeTab === 'monat' ? 'active' : undefined}>
      <h2>Monatsabrechnung</h2>
      <div className="section-sub">Wähle einen Monat aus, um die druckfähige Lohnabrechnung anzuzeigen.</div>

      <div className="card no-print">
        <div className="grid-3">
          <div>
            <label htmlFor="m-monat">Monat</label>
            <input type="month" id="m-monat" value={month} onChange={e => setMonth(e.target.value)} />
          </div>
          <ReportEmployeeSelect wrapId="m-employee-wrap" selId="m-employee"
            data={data} role={role} value={empSel} onChange={setEmpSel} />
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn" id="btn-print-monat" onClick={onPrint}>Drucken / als PDF speichern</button>
          </div>
        </div>
      </div>

      <div id="monat-doc">{doc}</div>
    </section>
  );
}
