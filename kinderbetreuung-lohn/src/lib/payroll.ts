// Verbatim port of the pay-settings lookup + Abrechnung calculation from app.js.

import { defaultPaySettingsData } from './state';
import type { AppState, Employee, PaySettingsData, PaySettingsVersion, Shift } from './state';
import { round2 } from './format';

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
  bruttoTotal: number;
  an: { ahvIvEo: number; alv: number; nbu: number; quellenst: number; total: number };
  netto: number;
  ag: { ahvIvEo: number; alv: number; fak: number; bu: number; verw: number; total: number };
  agKostenTotal: number;
  nbuApplicable: boolean;
  uvgAktivAny: boolean;
};

/* Each shift's calculation uses the pay_settings version that was active
   on shift.date. So a future "Lohnerhöhung" via a new version cannot
   retroactively change past Lohnabrechnungen.
   For label/percentage display in summaries we use the rates of the most
   recent shift's version in the period (which equals the only version if
   rates didn't change within the period). */
export function berechneAbrechnung(state: AppState, shifts: Shift[], employee: Employee): Abrechnung {
  let stundenTotal = 0, bruttoStunden = 0, ferienzulage = 0, bruttoTotal = 0;
  const an = { ahvIvEo: 0, alv: 0, nbu: 0, quellenst: 0, total: 0 };
  const ag = { ahvIvEo: 0, alv: 0, fak: 0, bu: 0, verw: 0, total: 0 };
  let nbuApplicable = false;
  let uvgAktivAny = false;

  for (const x of shifts) {
    const e = activePaySettingsFor(state, x.date);
    const hours = Number(x.hours) || 0;
    const xBrutto = hours * e.hourlyRate;
    const xFerien = xBrutto * e.vacationPercent / 100;
    const xBruttoTotal = xBrutto + xFerien;

    stundenTotal += hours;
    bruttoStunden += xBrutto;
    ferienzulage += xFerien;
    bruttoTotal += xBruttoTotal;

    const xNbuApplicable = e.uvgEnabled && employee.weeklyHoursThreshold8h;
    if (xNbuApplicable) nbuApplicable = true;
    if (e.uvgEnabled) uvgAktivAny = true;

    an.ahvIvEo   += xBruttoTotal * e.ahvIvEoEmployee / 100;
    an.alv       += xBruttoTotal * e.alvEmployee / 100;
    an.nbu       += xNbuApplicable ? xBruttoTotal * e.uvgNbuEmployee / 100 : 0;
    an.quellenst += xBruttoTotal * e.withholdingTax / 100;

    ag.ahvIvEo += xBruttoTotal * e.ahvIvEoEmployer / 100;
    ag.alv     += xBruttoTotal * e.alvEmployer / 100;
    ag.fak     += xBruttoTotal * e.fakEmployer / 100;
    ag.bu      += e.uvgEnabled ? xBruttoTotal * e.uvgBuEmployer / 100 : 0;
    ag.verw    += xBruttoTotal * e.adminFeeEmployer / 100;
  }

  stundenTotal = round2(stundenTotal);
  bruttoStunden = round2(bruttoStunden);
  ferienzulage = round2(ferienzulage);
  bruttoTotal = round2(bruttoTotal);
  an.ahvIvEo = round2(an.ahvIvEo);
  an.alv = round2(an.alv);
  an.nbu = round2(an.nbu);
  an.quellenst = round2(an.quellenst);
  ag.ahvIvEo = round2(ag.ahvIvEo);
  ag.alv = round2(ag.alv);
  ag.fak = round2(ag.fak);
  ag.bu = round2(ag.bu);
  ag.verw = round2(ag.verw);

  an.total = round2(an.ahvIvEo + an.alv + an.nbu + an.quellenst);
  const netto = round2(bruttoTotal - an.total);
  ag.total = round2(ag.ahvIvEo + ag.alv + ag.fak + ag.bu + ag.verw);
  const agKostenTotal = round2(bruttoTotal + ag.total);

  return { stundenTotal, bruttoStunden, ferienzulage, bruttoTotal, an, netto, ag, agKostenTotal, nbuApplicable, uvgAktivAny };
}
