import { describe, expect, it } from 'vitest';
import { berechneAbrechnung } from './payroll';
import { defaultPaySettingsData, sanitizeEmployeeData, vacationPercentForWeeks } from './state';
import type { AppState, Employee, HolidayMode, Shift } from './state';

// Builds a minimal household state with one hourly employee, one wage version
// and the statutory/cantonal default rates (which equal the Nov-2026 test case:
// AHV 5.3 %, ALV 1.1 %, FAK 1.025 %, Quellensteuer 5 %, Verwaltung 5 %, UVG).
function buildState(opts: { rate: number; month: string; holidayMode: HolidayMode; vacationWeeks?: number }): {
  state: AppState; employee: Employee;
} {
  const empId = 'emp-1';
  const employee: Employee = {
    id: empId,
    data: sanitizeEmployeeData({
      name: 'Tutu Katty Roxana',
      vacationWeeks: opts.vacationWeeks ?? 4,
      holidayMode: opts.holidayMode,
      weeklyHoursThreshold8h: false // kein NBU
    }),
    userId: null,
    archivedAt: null
  };
  const state: AppState = {
    householdName: 'Test',
    employer: { name: '', address: '', zip: '', city: '', country: 'CH', canton: 'ZH', billingNumber: '' },
    employees: [employee],
    wages: { [empId]: [{ id: 'w1', effectiveMonth: `${opts.month}-01`, hourlyRate: opts.rate, monthlySalary: 0 }] },
    paySettings: [{ id: 'ps1', effectiveMonth: `${opts.month}-01`, data: defaultPaySettingsData('ZH') }],
    shifts: []
  };
  return { state, employee };
}

function shift(date: string, hours: number): Shift {
  return { id: `s-${date}`, date, hours, note: '', startTime: null, endTime: null, entered_by: '', employeeId: 'emp-1' };
}

describe('berechneAbrechnung — Testfall November 2026 (5 Std., Vertrag Tutu Katty Roxana)', () => {
  const { state, employee } = buildState({ rate: 34.45, month: '2026-11', holidayMode: 'august' });
  const calc = berechneAbrechnung(state, [shift('2026-11-16', 5)], employee);

  it('Bruttolohn: Grundlohn + Ferien 8.33 % + Feiertag 1. August 0.39 %', () => {
    expect(calc.stundenTotal).toBe(5);
    expect(calc.bruttoStunden).toBe(172.25); // 5 × 34.45
    expect(calc.ferienzulage).toBe(14.35);   // 8.33 %
    expect(calc.feiertagPercent).toBe(0.39);
    expect(calc.feiertagszulage).toBe(0.65);  // 0.39 % (nur 1. August)
    expect(calc.bruttoTotal).toBe(187.25);
  });

  it('Abzüge Arbeitnehmer/in', () => {
    expect(calc.an.ahvIvEo).toBe(9.92);   // 5.3 %
    expect(calc.an.alv).toBe(2.06);       // 1.1 %
    expect(calc.an.nbu).toBe(0);          // kein NBU (< 8 h/Woche)
    expect(calc.an.quellenst).toBe(9.36); // 5 %
    expect(calc.an.total).toBe(21.34);
  });

  it('Nettolohn auf den Rappen, Auszahlung auf 5 Rappen, Rundungsdifferenz separat', () => {
    expect(calc.netto).toBe(165.91);
    expect(calc.auszahlung).toBe(165.90);
    expect(calc.rundungsdifferenz).toBe(-0.01);
  });

  it('Arbeitgeberbeiträge und Total Arbeitgeberkosten', () => {
    expect(calc.ag.ahvIvEo).toBe(9.92); // 5.3 %
    expect(calc.ag.alv).toBe(2.06);     // 1.1 %
    expect(calc.ag.fak).toBe(1.92);     // 1.025 %
    expect(calc.ag.bu).toBe(0.95);      // UVG-BU 0.505 %
    expect(calc.ag.verw).toBe(0.99);    // 5 % von 19.84 (AHV AN + AG)
    expect(calc.ag.total).toBe(15.84);
    expect(calc.agKostenTotal).toBe(203.09);
  });
});

describe('Feiertagszuschlag-Varianten', () => {
  it('volle Variante (3.59 %) reproduziert die alte Abrechnung (Brutto 192.80, netto 170.82 → 170.80)', () => {
    const { state, employee } = buildState({ rate: 34.45, month: '2026-11', holidayMode: 'full' });
    const calc = berechneAbrechnung(state, [shift('2026-11-16', 5)], employee);
    expect(calc.feiertagPercent).toBe(3.59);
    expect(calc.bruttoTotal).toBe(192.80);
    expect(calc.netto).toBe(170.82);
    expect(calc.auszahlung).toBe(170.80);
    expect(calc.rundungsdifferenz).toBe(-0.02);
  });

  it('Ferienzuschlag: 4 Wochen 8.33 %, 5 Wochen 10.64 % (GR-NAV), 6 Wochen 13.04 %', () => {
    expect(vacationPercentForWeeks(4)).toBe(8.33);
    expect(vacationPercentForWeeks(5)).toBe(10.64);
    expect(vacationPercentForWeeks(6)).toBe(13.04);
  });

  it('kein Feiertagszuschlag (0 %) lässt die Feiertagszulage weg', () => {
    const { state, employee } = buildState({ rate: 34.45, month: '2026-11', holidayMode: 'none' });
    const calc = berechneAbrechnung(state, [shift('2026-11-16', 5)], employee);
    expect(calc.feiertagPercent).toBe(0);
    expect(calc.feiertagszulage).toBe(0);
    // Brutto = Grundlohn + nur Ferienzulage.
    expect(calc.bruttoTotal).toBe(186.60); // round5(172.25 + 14.35)
  });
});
