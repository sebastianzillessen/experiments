// Swiss public holidays for the Sunday/holiday plausibility hint on a payslip.
//
// These are INDICATIVE only — used to flag shifts that fall on a Sunday or a
// public holiday so the user can check whether a surcharge or compensatory rest
// is due (NAV Hauswirtschaft). They are not authoritative: cantonal holidays
// vary, and some are only observed in parts of a canton.

type Holiday = { md: string; name: string };

// Gregorian Easter Sunday (Meeus/Jones/Butcher), as "MM-DD" of `year`.
function easter(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function mdFromOffset(year: number, base: { month: number; day: number }, offsetDays: number): string {
  const dt = new Date(Date.UTC(year, base.month - 1, base.day + offsetDays));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

// Holidays observed nationwide (or near enough for the hint).
function nationalHolidays(year: number): Holiday[] {
  const e = easter(year);
  return [
    { md: '01-01', name: 'Neujahr' },
    { md: mdFromOffset(year, e, -2), name: 'Karfreitag' },
    { md: mdFromOffset(year, e, 1), name: 'Ostermontag' },
    { md: mdFromOffset(year, e, 39), name: 'Auffahrt' },
    { md: mdFromOffset(year, e, 50), name: 'Pfingstmontag' },
    { md: '08-01', name: 'Bundesfeier' },
    { md: '12-25', name: 'Weihnachten' },
    { md: '12-26', name: 'Stephanstag' }
  ];
}

// Common cantonal additions (indicative). Cantons not listed fall back to the
// national set plus the widely observed Berchtoldstag / 1. Mai where relevant.
const CANTON_EXTRAS: Record<string, Holiday[]> = {
  ZH: [{ md: '01-02', name: 'Berchtoldstag' }, { md: '05-01', name: 'Tag der Arbeit' }],
  GR: [{ md: '01-06', name: 'Heilige Drei Könige' }]
};

function holidaysFor(year: number, canton: string | null | undefined): Holiday[] {
  const extras = (canton && CANTON_EXTRAS[canton]) ? CANTON_EXTRAS[canton] : [];
  return [...nationalHolidays(year), ...extras];
}

// Returns the holiday name if the ISO date (YYYY-MM-DD) is a public holiday in
// the given canton, else null.
export function holidayName(iso: string, canton: string | null | undefined): string | null {
  const [y, m, d] = iso.split('-');
  const md = `${m}-${d}`;
  const hit = holidaysFor(Number(y), canton).find(h => h.md === md);
  return hit ? hit.name : null;
}

// True iff the ISO date is a Sunday (local calendar day, no timezone shift).
export function isSunday(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}
