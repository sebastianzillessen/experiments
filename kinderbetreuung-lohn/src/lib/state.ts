// Verbatim port of the defaults + sanitization from the vanilla app.js.

export type PaySettingsData = {
  hourlyRate: number;
  vacationPercent: number;
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
};

export type Employer = {
  name: string;
  address: string;
  billingNumber: string;
};

export type Employee = {
  name: string;
  address: string;
  birthDate: string;
  ahvNumber: string;
  iban: string;
  weeklyHoursThreshold8h: boolean;
};

export type AppState = {
  employer: Employer;
  employee: Employee;
  paySettings: PaySettingsVersion[];
  shifts: Shift[];
};

export const LIMIT_VEREINFACHT = 22680; // CHF/Jahr brutto pro Person 2026

export function defaultPaySettingsData(): PaySettingsData {
  return {
    hourlyRate: 30.00,
    vacationPercent: 8.33,
    ahvIvEoEmployee: 5.30, ahvIvEoEmployer: 5.30,
    alvEmployee: 1.10,     alvEmployer: 1.10,
    fakEmployer: 1.00,
    withholdingTax: 5.00,
    adminFeeEmployer: 0.40,
    uvgEnabled: true,
    uvgBuEmployer: 0.505,
    uvgNbuEmployee: 1.47
  };
}

export const asString = (v: unknown): string => typeof v === 'string' ? v : (v == null ? '' : String(v));
export const asNumber = (v: unknown, fallback: number): number => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

export function sanitizePaySettingsData(d: unknown): PaySettingsData {
  const raw = (d && typeof d === 'object') ? d as Record<string, unknown> : {};
  const def = defaultPaySettingsData();
  return {
    hourlyRate:       asNumber(raw.hourlyRate,       def.hourlyRate),
    vacationPercent:  asNumber(raw.vacationPercent,  def.vacationPercent),
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
  const ee = (raw.employee && typeof raw.employee === 'object') ? raw.employee as Record<string, unknown> : {};
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
  return {
    employer: {
      name:           asString(er.name),
      address:        asString(er.address),
      billingNumber:  asString(er.billingNumber)
    },
    employee: {
      name:           asString(ee.name),
      address:        asString(ee.address),
      birthDate:      asString(ee.birthDate),
      ahvNumber:      asString(ee.ahvNumber),
      iban:           asString(ee.iban),
      weeklyHoursThreshold8h: !!ee.weeklyHoursThreshold8h
    },
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
            entered_by: asString(xx.entered_by)
          };
        }).filter((x): x is Shift => x !== null)
      : []
  };
}
