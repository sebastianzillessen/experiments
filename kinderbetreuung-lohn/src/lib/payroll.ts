// Verbatim port of the pay-settings/wage lookup + Abrechnung calculation from app.js.

import { defaultPaySettingsData, vacationPercentForWeeks } from './state';
import type { AppState, Employee, PaySettingsData, PaySettingsVersion, Shift, WageVersion } from './state';
import { round2, round5 } from './format';

/* ---- EMPLOYEE / WAGE HELPERS ---- */
// Active (non-archived) employees, in stable insertion order.
export function activeEmployees(state: AppState): Employee[] {
  return state.employees.filter(e => !e.archivedAt);
}

export function employeeById(state: AppState, id: string | null): Employee | null {
  return state.employees.find(e => e.id === id) || null;
}

// Employee record linked to the given user id (for the employee role).
export function ownEmployee(state: AppState, userId: string | null): Employee | null {
  return state.employees.find(e => e.userId && userId && e.userId === userId) || null;
}

// Newest hourly wage effective on or before `date` (ISO yyyy-mm-dd); 0 if none.
export function activeWageFor(state: AppState, employeeId: string, date: string): number {
  const list = state.wages[employeeId] || [];
  let rate = 0;
  for (const w of list) {
    if (w.effectiveMonth <= date) rate = w.hourlyRate;
    else break;
  }
  return rate;
}

// Newest monthly salary effective on or before `date` (Monatslohn employees); 0 if none.
export function activeMonthlySalaryFor(state: AppState, employeeId: string, date: string): number {
  const list = state.wages[employeeId] || [];
  let salary = 0;
  for (const w of list) {
    if (w.effectiveMonth <= date) salary = w.monthlySalary;
    else break;
  }
  return salary;
}

// True iff a wage version of this employee has shifts inside its effective
// period (i.e. up to the next version) — then it is locked, like pay_settings.
export function wageVersionHasShifts(state: AppState, employeeId: string, version: WageVersion): boolean {
  const list = state.wages[employeeId] || [];
  const idx = list.findIndex(v => v.id === version.id);
  const next = idx >= 0 ? list[idx + 1] : null;
  const from = version.effectiveMonth;
  const to = next ? next.effectiveMonth : null;
  return state.shifts.some(s =>
    s.employeeId === employeeId && s.date >= from && (to === null || s.date < to));
}

// Display name for an employee (falls back to a generic label).
export function employeeName(emp: Employee | null): string {
  return (emp && emp.data && emp.data.name) ? emp.data.name : 'Mitarbeiter/in';
}

/* ---- PAY SETTINGS LOOKUP ---- */
// Returns the active pay_settings.data for a given ISO date string. Falls
// back to defaults when no version covers the date (no versions yet, or
// the date predates the earliest version).
export function activePaySettingsFor(state: AppState, date: string): PaySettingsData {
  const versions = state.paySettings;
  let active: PaySettingsVersion | null = null;
  for (const v of versions) {
    if (v.effectiveMonth <= date) active = v;
    else break;
  }
  return active ? active.data : defaultPaySettingsData();
}

// Find the version that owns a given ISO date (or null if no version covers it).
export function activePaySettingsVersionFor(state: AppState, date: string): PaySettingsVersion | null {
  const versions = state.paySettings;
  let active: PaySettingsVersion | null = null;
  for (const v of versions) {
    if (v.effectiveMonth <= date) active = v;
    else break;
  }
  return active;
}

// Returns true iff at least one shift falls within the effective period
// of `version` (i.e. between version.effectiveMonth and the next version's
// effectiveMonth, exclusive).
export function versionHasShifts(state: AppState, version: PaySettingsVersion): boolean {
  const idx = state.paySettings.findIndex(v => v.id === version.id);
  const next = state.paySettings[idx + 1];
  const start = version.effectiveMonth;
  const end = next ? next.effectiveMonth : null;
  return state.shifts.some(s => s.date >= start && (!end || s.date < end));
}

export type Abrechnung = {
  stundenTotal: number;
  bruttoStunden: number;
  ferienzulage: number;
  feiertagszulage: number;
  bruttoTotal: number;
  an: { ahvIvEo: number; alv: number; nbu: number; quellenst: number; total: number };
  netto: number;
  ag: { ahvIvEo: number; alv: number; fak: number; bu: number; verw: number; total: number };
  agKostenTotal: number;
  nbuApplicable: boolean;
  uvgAktivAny: boolean;
};

/* ---- BERECHNUNG ----
   Callers always pass the shifts of a single calendar month. Because
   pay_settings versions are effective from the first of a month and a new
   version cannot be inserted over months that already have shifts, exactly
   one version applies to all shifts of a given month — so a single rate set
   governs each Abrechnung. A future "Lohnerhöhung" via a new version cannot
   retroactively change past Lohnabrechnungen.

   We mirror the SVA Zürich calculator: the gross is built from Rappen-rounded
   components (Grundlohn, Ferien-, Feiertagszulage), each contribution is then
   computed on that rounded Bruttolohn at Rappen precision, and the Nettolohn
   (the actual payout) is rounded to the 5-Rappen grid. */
// `employee` is an employee record { id, data:{…} }. The hourly wage comes from
// that employee's versioned employee_wages; the statutory/cantonal rates still
// come from the household-wide pay_settings.
export function berechneAbrechnung(state: AppState, shifts: Shift[], employee: Employee | null): Abrechnung {
  const empData = (employee && employee.data) ? employee.data : null;
  const empId = (employee && employee.id) ? employee.id : null;
  const isMonthly = empData?.employmentType === 'monthly';

  let stundenTotal = 0;
  let bruttoStunden = 0, ferienzulage = 0, feiertagszulage = 0, bruttoTotal = 0;
  let nbuApplicable = false;
  let uvgAktivAny = false;
  // Active rate set for the month. Defaults cover the empty-entry case; it is
  // overwritten with the (single) version that applies to these entries.
  let e = defaultPaySettingsData();

  if (isMonthly) {
    // Monatslohn: the fixed monthly salary IS the gross. Vacation and public
    // holidays are already included (paid time off), so no Ferien-/Feiertags-
    // zulage is added. Entries are month markers (hours = null) — there is
    // normally exactly one per month.
    const dates = shifts.map(x => x.date).sort((a, b) => a.localeCompare(b));
    const refDate = dates.length ? dates[dates.length - 1] : null;
    if (refDate) e = activePaySettingsFor(state, refDate);
    const salary = (empId && refDate) ? activeMonthlySalaryFor(state, empId, refDate) : 0;
    if (e.uvgEnabled) uvgAktivAny = true;
    if (e.uvgEnabled && empData?.weeklyHoursThreshold8h) nbuApplicable = true;
    bruttoStunden = round5(salary);
    bruttoTotal   = round5(salary);
  } else {
    let bruttoStundenRaw = 0;
    for (const x of shifts) {
      e = activePaySettingsFor(state, x.date);
      const hours = Number(x.hours) || 0;
      const rate = empId ? activeWageFor(state, empId, x.date) : 0;
      stundenTotal += hours;
      bruttoStundenRaw += hours * rate;
      if (e.uvgEnabled) uvgAktivAny = true;
      if (e.uvgEnabled && empData?.weeklyHoursThreshold8h) nbuApplicable = true;
    }

    // Ferienzulage is driven by the employee's Ferienanspruch (4/5/6 weeks),
    // not by the versioned pay_settings.
    const vacationPercent = vacationPercentForWeeks(empData?.vacationWeeks ?? 4);

    stundenTotal     = round2(stundenTotal);
    bruttoStunden    = round5(bruttoStundenRaw);
    ferienzulage     = round5(bruttoStundenRaw * vacationPercent / 100);
    feiertagszulage  = round5(bruttoStundenRaw * e.holidayPercent / 100);
    bruttoTotal      = round5(bruttoStunden + ferienzulage + feiertagszulage);
  }

  const an = {
    ahvIvEo:   round2(bruttoTotal * e.ahvIvEoEmployee / 100),
    alv:       round2(bruttoTotal * e.alvEmployee / 100),
    nbu:       nbuApplicable ? round2(bruttoTotal * e.uvgNbuEmployee / 100) : 0,
    quellenst: round2(bruttoTotal * e.withholdingTax / 100),
    total: 0
  };
  an.total = round2(an.ahvIvEo + an.alv + an.nbu + an.quellenst);
  const netto = round5(bruttoTotal - an.total);

  // Verwaltungskosten der SVA werden in % der AHV/IV/EO-Beiträge (AN + AG) berechnet.
  const ahvIvEoBeitraege = bruttoTotal * (e.ahvIvEoEmployee + e.ahvIvEoEmployer) / 100;
  const ag = {
    ahvIvEo: round2(bruttoTotal * e.ahvIvEoEmployer / 100),
    alv:     round2(bruttoTotal * e.alvEmployer / 100),
    fak:     round2(bruttoTotal * e.fakEmployer / 100),
    bu:      uvgAktivAny ? round2(bruttoTotal * e.uvgBuEmployer / 100) : 0,
    verw:    round2(ahvIvEoBeitraege * e.adminFeeEmployer / 100),
    total: 0
  };
  ag.total = round2(ag.ahvIvEo + ag.alv + ag.fak + ag.bu + ag.verw);
  const agKostenTotal = round2(bruttoTotal + ag.total);

  return { stundenTotal, bruttoStunden, ferienzulage, feiertagszulage, bruttoTotal, an, netto, ag, agKostenTotal, nbuApplicable, uvgAktivAny };
}
