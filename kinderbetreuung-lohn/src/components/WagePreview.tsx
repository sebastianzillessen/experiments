import { useState } from 'react';
import { activePaySettingsFor, berechneAbrechnung } from '../lib/payroll';
import { fmtChf, fmtNum, monthLabel } from '../lib/format';
import { vacationPercentForWeeks } from '../lib/state';
import type { AppState, Employee, Shift } from '../lib/state';

// Live breakdown for a wage that is being entered. It runs the real
// Monatsabrechnung calculation on a made-up month, so the numbers match exactly.
export function WagePreview({ data, employee, amount, effectiveMonth }: {
  data: AppState; employee: Employee; amount: number; effectiveMonth: string; // "YYYY-MM-01"
}) {
  const [hoursStr, setHoursStr] = useState('1');
  const empId = employee.id!;
  const monthly = employee.data.employmentType === 'monthly';
  const hours = Number(hoursStr) > 0 ? Number(hoursStr) : 1;

  const otherVersions = (data.wages[empId] || []).filter(w => w.effectiveMonth !== effectiveMonth);
  const wages = [...otherVersions, { id: null, effectiveMonth, hourlyRate: monthly ? 0 : amount, monthlySalary: monthly ? amount : 0 }]
    .sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
  const shift: Shift = {
    id: 'preview', date: effectiveMonth, hours: monthly ? null : hours, note: '',
    startTime: null, endTime: null, entered_by: '', employeeId: empId
  };
  const calc = berechneAbrechnung({ ...data, wages: { ...data.wages, [empId]: wages } }, [shift], employee);
  const e = activePaySettingsFor(data, effectiveMonth);
  const weeks = employee.data.vacationWeeks ?? 4;

  return (
    <div className="print-doc wage-preview no-print" id="wage-preview">
      <div className="wage-preview-head">
        <strong>Vorschau ab {monthLabel(effectiveMonth.slice(0, 7))}</strong>
        {!monthly && (
          <span className="wage-preview-hours">
            für
            <input type="number" id="wage-preview-hours" min="0.25" step="0.25" inputMode="decimal"
              value={hoursStr} onChange={ev => setHoursStr(ev.target.value)} aria-label="Stunden für die Vorschau" />
            Std.
          </span>
        )}
      </div>

      <h4>Bruttolohn</h4>
      {monthly ? (
        <div className="summary-row"><span>Monatslohn (Ferien &amp; Feiertage inbegriffen)</span><span>CHF {fmtChf(calc.bruttoStunden)}</span></div>
      ) : (
        <>
          <div className="summary-row"><span>{fmtNum(hours)} Std. × CHF {fmtChf(amount)}</span><span>CHF {fmtChf(calc.bruttoStunden)}</span></div>
          <div className="summary-row"><span>+ Ferienzulage ({weeks} Wochen, {vacationPercentForWeeks(weeks)} %)</span><span>CHF {fmtChf(calc.ferienzulage)}</span></div>
          <div className="summary-row"><span>+ Feiertagszulage ({e.holidayPercent} %)</span><span>CHF {fmtChf(calc.feiertagszulage)}</span></div>
        </>
      )}
      <div className="summary-row total"><span>Bruttolohn</span><span>CHF {fmtChf(calc.bruttoTotal)}</span></div>

      <h4>Abzüge Arbeitnehmer/in</h4>
      {calc.isPensioner && calc.freibetrag > 0 && (
        <div className="summary-row"><span>AHV-pflichtig (Bruttolohn − Freibetrag CHF {fmtChf(calc.freibetrag)})</span><span>CHF {fmtChf(calc.ahvBasis)}</span></div>
      )}
      <div className="summary-row"><span>– AHV/IV/EO ({e.ahvIvEoEmployee} %)</span><span>CHF {fmtChf(calc.an.ahvIvEo)}</span></div>
      {calc.isPensioner ? (
        <div className="summary-row"><span>– ALV (entfällt – AHV-Referenzalter)</span><span>CHF {fmtChf(0)}</span></div>
      ) : (
        <div className="summary-row"><span>– ALV ({e.alvEmployee} %)</span><span>CHF {fmtChf(calc.an.alv)}</span></div>
      )}
      {calc.nbuApplicable && (
        <div className="summary-row"><span>– UVG-NBU ({e.uvgNbuEmployee} %)</span><span>CHF {fmtChf(calc.an.nbu)}</span></div>
      )}
      <div className="summary-row"><span>– Quellensteuer ({e.withholdingTax} %)</span><span>CHF {fmtChf(calc.an.quellenst)}</span></div>
      <div className="summary-row total"><span>Total Abzüge</span><span>CHF {fmtChf(calc.an.total)}</span></div>

      <div className="summary-row netto"><span>Auszahlung netto</span><span>CHF {fmtChf(calc.netto)}</span></div>

      <h4>Arbeitgeberbeiträge</h4>
      <div className="summary-row"><span>AHV/IV/EO ({e.ahvIvEoEmployer} %)</span><span>CHF {fmtChf(calc.ag.ahvIvEo)}</span></div>
      {!calc.isPensioner && (
        <div className="summary-row"><span>ALV ({e.alvEmployer} %)</span><span>CHF {fmtChf(calc.ag.alv)}</span></div>
      )}
      <div className="summary-row"><span>FAK ({e.fakEmployer} %)</span><span>CHF {fmtChf(calc.ag.fak)}</span></div>
      {calc.uvgAktivAny && (
        <div className="summary-row"><span>UVG-BU ({e.uvgBuEmployer} %)</span><span>CHF {fmtChf(calc.ag.bu)}</span></div>
      )}
      <div className="summary-row"><span>Verwaltungskosten ({e.adminFeeEmployer} % der AHV/IV/EO-Beiträge)</span><span>CHF {fmtChf(calc.ag.verw)}</span></div>
      <div className="summary-row total"><span>Total Arbeitgeberkosten (Brutto + AG-Beiträge)</span><span>CHF {fmtChf(calc.agKostenTotal)}</span></div>
      <div className="footnote" style={{ marginTop: 8 }}>
        Gerechnet mit den Sätzen aus den Einstellungen{monthly ? '' : '; der Nettolohn wird auf 5 Rappen gerundet'}.
      </div>
    </div>
  );
}
