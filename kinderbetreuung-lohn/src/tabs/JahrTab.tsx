import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { activePaySettingsFor, berechneAbrechnung } from '../lib/payroll';
import { fmtChf, fmtNum, monthLabel, round2 } from '../lib/format';
import { LIMIT_VEREINFACHT } from '../lib/state';
import type { AppState, Employee, Shift } from '../lib/state';
import { ReportEmployeeSelect, reportScope } from './MonatTab';

export function yearShiftsFor(state: AppState, empId: string | null, jahr: number): Shift[] {
  return state.shifts.filter(e => e.employeeId === empId && e.date.startsWith(String(jahr)));
}

function Jahresuebersicht({ data, eintraege, jahr, employee }: {
  data: AppState; eintraege: Shift[]; jahr: number; employee: Employee | null;
}) {
  const ee = employee?.data ?? null;
  const er = data.employer;
  const uvgUsedAnywhere = eintraege.some(x => activePaySettingsFor(data, x.date).uvgEnabled);

  const monatsRows: { yyyymm: string; calc: ReturnType<typeof berechneAbrechnung> }[] = [];
  let yJahresBrutto = 0, yJahresStunden = 0, yJahresNetto = 0, yJahresAG = 0, yJahresAN = 0;

  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const yyyymm = `${jahr}-${mm}`;
    const monatEintraege = eintraege.filter(x => x.date.startsWith(yyyymm));
    if (!monatEintraege.length) continue;
    const calc = berechneAbrechnung(data, monatEintraege, employee);
    yJahresStunden += calc.stundenTotal;
    yJahresBrutto += calc.bruttoTotal;
    yJahresNetto += calc.netto;
    yJahresAG += calc.ag.total;
    yJahresAN += calc.an.total;
    monatsRows.push({ yyyymm, calc });
  }

  yJahresBrutto = round2(yJahresBrutto);
  yJahresNetto = round2(yJahresNetto);
  yJahresAG = round2(yJahresAG);
  yJahresAN = round2(yJahresAN);
  yJahresStunden = round2(yJahresStunden);
  const agKostenTotal = round2(yJahresBrutto + yJahresAG);

  if (!monatsRows.length) {
    return <div className="empty-state">Keine Einsätze im Jahr {jahr} erfasst.</div>;
  }

  let warnung = null;
  if (yJahresBrutto > LIMIT_VEREINFACHT) {
    warnung = (
      <div className="danger">Bruttolohn übersteigt CHF {fmtChf(LIMIT_VEREINFACHT)} — vereinfachte Abrechnung nicht mehr möglich. Wechsel zur ordentlichen Abrechnung erforderlich.</div>
    );
  } else if (yJahresBrutto >= LIMIT_VEREINFACHT * 0.9) {
    warnung = (
      <div className="warn"><strong>Achtung:</strong> Schon {Math.round(yJahresBrutto / LIMIT_VEREINFACHT * 100)} % der Jahresgrenze (CHF {fmtChf(LIMIT_VEREINFACHT)}) erreicht. Restbudget für {jahr}: CHF {fmtChf(round2(LIMIT_VEREINFACHT - yJahresBrutto))}.</div>
    );
  }

  return (
    <div className="print-doc">
      <div className="doc-header">
        <div className="party">
          <div className="label-small">Arbeitgeber/in</div>
          <div className="name">{er.name || <span className="muted">(Stammdaten)</span>}</div>
          <div>{er.address}</div>
        </div>
        <div className="party" style={{ textAlign: 'right' }}>
          <div className="label-small">Arbeitnehmer/in</div>
          <div className="name">{ee?.name || <span className="muted">(Stammdaten)</span>}</div>
          {ee?.ahvNumber ? <div className="muted">AHV-Nr.: {ee.ahvNumber}</div> : null}
        </div>
      </div>

      <div className="doc-title">
        <h1>Jahresübersicht {jahr}</h1>
        <div className="period">Vereinfachte Abrechnung Kanton Zürich</div>
      </div>

      {warnung}

      <h4>Monatsübersicht</h4>
      <table>
        <thead>
          <tr><th>Monat</th><th className="num">Stunden</th><th className="num">Brutto</th><th className="num">AN-Abzüge</th><th className="num">Netto</th><th className="num">AG-Beiträge</th></tr>
        </thead>
        <tbody>
          {monatsRows.map(({ yyyymm, calc }) => (
            <tr key={yyyymm}>
              <td>{monthLabel(yyyymm)}</td>
              <td className="num">{fmtNum(calc.stundenTotal)}</td>
              <td className="num">CHF {fmtChf(calc.bruttoTotal)}</td>
              <td className="num">CHF {fmtChf(calc.an.total)}</td>
              <td className="num">CHF {fmtChf(calc.netto)}</td>
              <td className="num">CHF {fmtChf(calc.ag.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="total-row">
            <td>Total {jahr}</td>
            <td className="num">{fmtNum(yJahresStunden)}</td>
            <td className="num">CHF {fmtChf(yJahresBrutto)}</td>
            <td className="num">CHF {fmtChf(yJahresAN)}</td>
            <td className="num">CHF {fmtChf(yJahresNetto)}</td>
            <td className="num">CHF {fmtChf(yJahresAG)}</td>
          </tr>
        </tfoot>
      </table>

      <h4>Lohndeklaration SVA Zürich</h4>
      <div className="summary-row"><span>Bruttolohnsumme {jahr}</span><span>CHF {fmtChf(yJahresBrutto)}</span></div>
      <div className="summary-row"><span>Total Arbeitgeberbeiträge</span><span>CHF {fmtChf(yJahresAG)}</span></div>
      <div className="summary-row total"><span>Total Arbeitgeberkosten</span><span>CHF {fmtChf(agKostenTotal)}</span></div>

      <div className="info" style={{ marginTop: 14 }}>
        Den Bruttolohn von <strong>CHF {fmtChf(yJahresBrutto)}</strong> bei der SVA Zürich als Lohndeklaration {jahr} einreichen (Frist üblicherweise Ende Januar {jahr + 1}). Die Ausgleichskasse stellt anschliessend die Schlussrechnung über Sozialversicherungsbeiträge{uvgUsedAnywhere ? ', UVG-Prämien' : ''} und Quellensteuer.
      </div>
    </div>
  );
}

export function JahrTab() {
  const { activeTab, data, role, user } = useApp();
  const [yearStr, setYearStr] = useState(() => String(new Date().getFullYear()));
  const [empSel, setEmpSel] = useState('');

  const jahr = Number(yearStr);
  const ownId = data.employees.find(e => e.userId && e.userId === user?.id)?.id ?? null;
  const scope = reportScope(data, role, ownId, empSel);

  let doc = null;
  if (jahr) {
    if (scope.mode === 'one') {
      doc = !scope.emp ? (
        <div className="empty-state">Bitte zuerst unter „Mitarbeitende" eine Person anlegen.</div>
      ) : (
        <Jahresuebersicht data={data} eintraege={yearShiftsFor(data, scope.emp.id, jahr)} jahr={jahr} employee={scope.emp} />
      );
    } else {
      const emps = scope.emps.filter(e => yearShiftsFor(data, e.id, jahr).length);
      doc = !emps.length ? (
        <div className="empty-state">Keine Einsätze im Jahr {jahr} erfasst.</div>
      ) : (
        <>
          {emps.map(emp => (
            <div className="employee-doc" key={emp.id}>
              <Jahresuebersicht data={data} eintraege={yearShiftsFor(data, emp.id, jahr)} jahr={jahr} employee={emp} />
            </div>
          ))}
        </>
      );
    }
  }

  return (
    <section id="jahr" role="tabpanel" aria-labelledby="tab-jahr" tabIndex={0}
      className={activeTab === 'jahr' ? 'active' : undefined}>
      <h2>Jahresübersicht</h2>
      <div className="section-sub">Monatszusammenfassung und Jahres-Lohndeklaration für die SVA Zürich.</div>

      <div className="card no-print">
        <div className="grid-3">
          <div>
            <label htmlFor="j-jahr">Jahr</label>
            <input type="number" id="j-jahr" min="2020" max="2099" step="1"
              value={yearStr} onChange={e => setYearStr(e.target.value)} />
          </div>
          <ReportEmployeeSelect wrapId="j-employee-wrap" selId="j-employee"
            data={data} role={role} value={empSel} onChange={setEmpSel} />
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn" id="btn-print-jahr" onClick={() => window.print()}>Drucken / als PDF speichern</button>
          </div>
        </div>
      </div>

      <div id="jahr-doc">{doc}</div>
    </section>
  );
}
