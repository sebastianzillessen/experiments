import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { activePaySettingsFor, berechneAbrechnung } from '../lib/payroll';
import { fmtChf, fmtDate, fmtNum, monthLabel, round2 } from '../lib/format';
import { printSection } from '../lib/print';
import type { AppState, Shift } from '../lib/state';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function Lohnabrechnung({ data, eintraege, yyyymm }: { data: AppState; eintraege: Shift[]; yyyymm: string }) {
  const er = data.employer;
  const ee = data.employee;
  const calc = berechneAbrechnung(data, eintraege, ee);

  if (!eintraege.length) {
    return <div className="empty-state">Keine Einsätze in {monthLabel(yyyymm)} erfasst.</div>;
  }

  // Use the rates of the latest shift in the period for label percentages.
  // Per-shift amounts in `calc` are correct even if rates vary within a month.
  const sorted = [...eintraege].sort((a, b) => a.date.localeCompare(b.date));
  const e = activePaySettingsFor(data, sorted[sorted.length - 1].date);

  return (
    <div className="print-doc">
      <div className="doc-header">
        <div className="party">
          <div className="label-small">Arbeitgeber/in</div>
          <div className="name">{er.name || <span className="muted">(Stammdaten ergänzen)</span>}</div>
          <div>{er.address}</div>
          {er.billingNumber ? <div className="muted">SVA-Abr.-Nr.: {er.billingNumber}</div> : null}
        </div>
        <div className="party" style={{ textAlign: 'right' }}>
          <div className="label-small">Arbeitnehmer/in</div>
          <div className="name">{ee.name || <span className="muted">(Stammdaten ergänzen)</span>}</div>
          <div>{ee.address}</div>
          {ee.ahvNumber ? <div className="muted">AHV-Nr.: {ee.ahvNumber}</div> : null}
        </div>
      </div>

      <div className="doc-title">
        <h1>Lohnabrechnung Kinderbetreuung</h1>
        <div className="period">{monthLabel(yyyymm)}</div>
      </div>

      <h4>Geleistete Stunden</h4>
      <table>
        <thead>
          <tr><th>Datum</th><th>Notiz</th><th className="num">Stunden</th><th className="num">Stundenlohn</th><th className="num">Betrag</th></tr>
        </thead>
        <tbody>
          {sorted.map(x => {
            const xE = activePaySettingsFor(data, x.date);
            return (
              <tr key={x.id}>
                <td>{fmtDate(x.date)}</td>
                <td>{x.note ? x.note : ''}</td>
                <td className="num">{fmtNum(x.hours)}</td>
                <td className="num">CHF {fmtChf(xE.hourlyRate)}</td>
                <td className="num">CHF {fmtChf(round2(x.hours * xE.hourlyRate))}</td>
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
      <div className="summary-row"><span>+ Ferienzulage ({e.vacationPercent} %)</span><span>CHF {fmtChf(calc.ferienzulage)}</span></div>
      <div className="summary-row total"><span>Bruttolohn</span><span>CHF {fmtChf(calc.bruttoTotal)}</span></div>

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
      <div className="summary-row"><span>Verwaltungskosten ({e.adminFeeEmployer} %)</span><span>CHF {fmtChf(calc.ag.verw)}</span></div>
      <div className="summary-row total"><span>Total Arbeitgeberbeiträge</span><span>CHF {fmtChf(calc.ag.total)}</span></div>
      <div className="summary-row total"><span>Total Arbeitgeberkosten (Brutto + AG-Beiträge)</span><span>CHF {fmtChf(calc.agKostenTotal)}</span></div>

      <div className="footnote">
        Vereinfachtes Abrechnungsverfahren der SVA Zürich ({e.uvgEnabled ? 'VAVplus' : 'VAV'}). Quellensteuer und Sozialversicherungsbeiträge werden direkt mit der Ausgleichskasse abgerechnet. {e.uvgEnabled ? 'Unfallversicherung über SVA Zürich.' : 'Unfallversicherung separat über privaten Versicherer.'}
      </div>

      <div className="signatures">
        <div className="sig">Ort, Datum &amp; Unterschrift Arbeitgeber/in</div>
        <div className="sig">Ort, Datum &amp; Unterschrift Arbeitnehmer/in (Empfangsbestätigung)</div>
      </div>
    </div>
  );
}

export function MonatTab() {
  const { activeTab, data } = useApp();
  const [month, setMonth] = useState(currentMonth);

  const eintraege = month ? data.shifts.filter(e => e.date.startsWith(month)) : [];

  return (
    <section id="monat" role="tabpanel" aria-labelledby="tab-monat" tabIndex={0}
      className={activeTab === 'monat' ? 'active' : undefined}>
      <h2>Monatsabrechnung</h2>
      <div className="section-sub">Wähle einen Monat aus, um die druckfähige Lohnabrechnung anzuzeigen.</div>

      <div className="card no-print">
        <div className="grid-2">
          <div>
            <label htmlFor="m-monat">Monat</label>
            <input type="month" id="m-monat" value={month} onChange={e => setMonth(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn" id="btn-print-monat" onClick={() => printSection('monat')}>Drucken / als PDF speichern</button>
          </div>
        </div>
      </div>

      <div id="monat-doc">
        {month ? <Lohnabrechnung data={data} eintraege={eintraege} yyyymm={month} /> : null}
      </div>
    </section>
  );
}
