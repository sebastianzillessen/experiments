// Verbatim port of the defaults + sanitization from the vanilla app.js.

export type PaySettingsData = {
  holidayPercent: number;
  ahvIvEoEmployee: number;
  ahvIvEoEmployer: number;
  alvEmployee: number;
  alvEmployer: number;
  fakEmployer: number;
  withholdingTax: number;
  adminFeeEmployer: number;
  uvgEnabled: boolean;
  uvgBuEmployer: number;
  uvgNbuEmployee: number;
};

export type PaySettingsVersion = {
  id: string | null;
  effectiveMonth: string; // "YYYY-MM-01"
  data: PaySettingsData;
};

export type Shift = {
  id: string;
  date: string; // ISO "YYYY-MM-DD"
  hours: number;
  note: string;
  entered_by: string;
  employeeId: string | null;
};

export type Employer = {
  name: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  billingNumber: string;
};

// Stammdaten of a single employee (same shape as the old household_profile.employee).
export type EmployeeData = {
  name: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  birthDate: string;
  ahvNumber: string;
  iban: string;
  weeklyHoursThreshold8h: boolean;
  vacationWeeks: number; // 4 | 5 | 6
};

export type Employee = {
  id: string | null;
  data: EmployeeData;
  userId: string | null;
  archivedAt: string | null;
};

// Versioned hourly wage of one employee (newest effective_month wins per date).
export type WageVersion = {
  id: string | null;
  effectiveMonth: string; // "YYYY-MM-01"
  hourlyRate: number;
};

export type AppState = {
  householdName: string;
  employer: Employer;
  employees: Employee[];
  wages: Record<string, WageVersion[]>; // keyed by employee id
  paySettings: PaySettingsVersion[];
  shifts: Shift[];
};

export const LIMIT_VEREINFACHT = 22680; // CHF/Jahr brutto pro Person 2026

/* ---- DEFAULTS ---- */
// Ferienentschädigung is an employee-level entitlement: 4, 5 or 6 weeks map to
// a fixed Zuschlag on the gross hourly wage (Kanton Zürich / NAV Hauswirtschaft).
export const VACATION_WEEKS_PERCENT: Record<number, number> = { 4: 8.33, 5: 10.63, 6: 13.04 };
export function vacationPercentForWeeks(weeks: number): number {
  return VACATION_WEEKS_PERCENT[weeks] ?? VACATION_WEEKS_PERCENT[4];
}

export function defaultPaySettingsData(): PaySettingsData {
  return {
    holidayPercent: 3.59,    // Feiertagsentschädigung: 3.59 % entspricht 9 ZH-Feiertagen (NAV Hauswirtschaft)
    ahvIvEoEmployee: 5.30, ahvIvEoEmployer: 5.30,
    alvEmployee: 1.10,     alvEmployer: 1.10,
    fakEmployer: 1.025,
    withholdingTax: 5.00,
    adminFeeEmployer: 5.00,  // Verwaltungskosten: % der AHV/IV/EO-Beiträge (AN + AG)
    uvgEnabled: true,
    uvgBuEmployer: 0.505,
    uvgNbuEmployee: 1.432
  };
}

export const asString = (v: unknown): string => typeof v === 'string' ? v : (v == null ? '' : String(v));
export const asNumber = (v: unknown, fallback: number): number => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

export function sanitizePaySettingsData(d: unknown): PaySettingsData {
  const raw = (d && typeof d === 'object') ? d as Record<string, unknown> : {};
  const def = defaultPaySettingsData();
  return {
    holidayPercent:   asNumber(raw.holidayPercent,   def.holidayPercent),
    ahvIvEoEmployee:  asNumber(raw.ahvIvEoEmployee,  def.ahvIvEoEmployee),
    ahvIvEoEmployer:  asNumber(raw.ahvIvEoEmployer,  def.ahvIvEoEmployer),
    alvEmployee:      asNumber(raw.alvEmployee,      def.alvEmployee),
    alvEmployer:      asNumber(raw.alvEmployer,      def.alvEmployer),
    fakEmployer:      asNumber(raw.fakEmployer,      def.fakEmployer),
    withholdingTax:   asNumber(raw.withholdingTax,   def.withholdingTax),
    adminFeeEmployer: asNumber(raw.adminFeeEmployer, def.adminFeeEmployer),
    uvgEnabled:       raw.uvgEnabled === undefined ? def.uvgEnabled : !!raw.uvgEnabled,
    uvgBuEmployer:    asNumber(raw.uvgBuEmployer,    def.uvgBuEmployer),
    uvgNbuEmployee:   asNumber(raw.uvgNbuEmployee,   def.uvgNbuEmployee)
  };
}

export function sanitizeEmployeeData(eeRaw: unknown): EmployeeData {
  const ee = (eeRaw && typeof eeRaw === 'object') ? eeRaw as Record<string, unknown> : {};
  return {
    name:           asString(ee.name),
    address:        asString(ee.address),
    zip:            asString(ee.zip),
    city:           asString(ee.city),
    country:        asString(ee.country) || 'CH',
    birthDate:      asString(ee.birthDate),
    ahvNumber:      asString(ee.ahvNumber),
    iban:           asString(ee.iban),
    weeklyHoursThreshold8h: !!ee.weeklyHoursThreshold8h,
    vacationWeeks:  [4, 5, 6].includes(Number(ee.vacationWeeks)) ? Number(ee.vacationWeeks) : 4
  };
}

export function sanitizeWageList(arr: unknown): WageVersion[] {
  return Array.isArray(arr)
    ? (arr as unknown[]).map((w): WageVersion | null => {
        if (!w || typeof w !== 'object') return null;
        const ww = w as Record<string, unknown>;
        const effectiveMonth = normalizeEffectiveMonth(ww.effectiveMonth);
        if (!effectiveMonth) return null;
        return { id: asString(ww.id) || null, effectiveMonth, hourlyRate: asNumber(ww.hourlyRate, 0) };
      }).filter((w): w is WageVersion => w !== null)
        .sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth))
    : [];
}

// Accept "YYYY-MM" or "YYYY-MM-DD"; return "YYYY-MM-01" or null on bad input.
export function normalizeEffectiveMonth(value: unknown): string | null {
  const s = asString(value);
  const m = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

export function sanitizeState(rawInput: unknown): AppState {
  const raw = (rawInput && typeof rawInput === 'object') ? rawInput as Record<string, unknown> : {};
  const er = (raw.employer && typeof raw.employer === 'object') ? raw.employer as Record<string, unknown> : {};
  const paySettings: PaySettingsVersion[] = Array.isArray(raw.paySettings)
    ? (raw.paySettings as unknown[]).map((v): PaySettingsVersion | null => {
        if (!v || typeof v !== 'object') return null;
        const vv = v as Record<string, unknown>;
        const effectiveMonth = normalizeEffectiveMonth(vv.effectiveMonth);
        if (!effectiveMonth) return null;
        return {
          id: asString(vv.id) || null,
          effectiveMonth,
          data: sanitizePaySettingsData(vv.data)
        };
      }).filter((v): v is PaySettingsVersion => v !== null)
        .sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth))
    : [];

  // Employees: prefer the multi-employee shape; fall back to a legacy single
  // `employee` object (old exports) as one entry so import stays compatible.
  let employees: Employee[] = [];
  if (Array.isArray(raw.employees)) {
    employees = (raw.employees as unknown[]).map((e): Employee | null => {
      if (!e || typeof e !== 'object') return null;
      const ee = e as Record<string, unknown>;
      return {
        id: asString(ee.id) || null,
        data: sanitizeEmployeeData(ee.data),
        userId: asString(ee.userId || ee.user_id) || null,
        archivedAt: asString(ee.archivedAt || ee.archived_at) || null
      };
    }).filter((e): e is Employee => e !== null);
  } else if (raw.employee && typeof raw.employee === 'object') {
    employees = [{ id: null, data: sanitizeEmployeeData(raw.employee), userId: null, archivedAt: null }];
  }

  // Wages keyed by employee id.
  const wages: Record<string, WageVersion[]> = {};
  if (raw.wages && typeof raw.wages === 'object') {
    const w = raw.wages as Record<string, unknown>;
    for (const k of Object.keys(w)) wages[k] = sanitizeWageList(w[k]);
  }

  return {
    householdName: asString(raw.householdName),
    employer: {
      name:           asString(er.name),
      address:        asString(er.address),
      zip:            asString(er.zip),
      city:           asString(er.city),
      country:        asString(er.country) || 'CH',
      billingNumber:  asString(er.billingNumber)
    },
    employees,
    wages,
    paySettings,
    shifts: Array.isArray(raw.shifts)
      ? (raw.shifts as unknown[]).map((x): Shift | null => {
          if (!x || typeof x !== 'object') return null;
          const xx = x as Record<string, unknown>;
          const hours = asNumber(xx.hours, NaN);
          const date = asString(xx.date);
          if (!date || !Number.isFinite(hours) || hours <= 0) return null;
          return {
            id: asString(xx.id),
            date, hours,
            note: asString(xx.note),
            entered_by: asString(xx.entered_by),
            employeeId: asString(xx.employeeId || xx.employee_id) || null
          };
        }).filter((x): x is Shift => x !== null)
      : []
  };
}
