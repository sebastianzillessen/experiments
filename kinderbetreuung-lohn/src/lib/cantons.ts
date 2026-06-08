// Per-canton presets for the simplified Swiss household payroll (VAV/VAVplus).
//
// IMPORTANT: only a few inputs truly vary by canton. AHV/IV/EO (10.6 %), ALV
// (2.2 %), the VAV-Quellensteuer (5 %) and the Ferien-% (OR 329a) are FEDERAL and
// identical everywhere — they are NOT stored here. What varies is:
//   - FAK employer rate (Familienausgleichskasse): ~1.0–2.8 %, set per canton AND
//     per Ausgleichskasse, and adjusted yearly (2026–29 federal equalisation reform).
//   - Feiertagszulage %: a surcharge standing in for the canton's paid public
//     holidays (≈ holidays / working days).
//   - Minimum hourly wage: federal NAV Hauswirtschaft baseline, overridden by the
//     statutory cantonal minimum wages in GE / BS / JU / NE / TI.
//
// All values here are EDITABLE Richtwerte used only to PREFILL a new pay-settings
// version and to drive informational labels/hints — never authoritative. The user
// can always override them per versioned pay_settings. The figures are not
// published authoritatively in one place and change yearly; treat as a starting
// point and verify with the household's own Ausgleichskasse.

export type CantonPreset = {
  code: string;
  name: string;
  ausgleichskasse: string;
  fakEmployer: number;    // % — editable Richtwert
  holidayPercent: number; // % — editable Richtwert (≈ holidayCount × 3.59/9)
  holidayCount: number;   // informational: paid public holidays in the canton
  minWageChf: number;     // CHF/h — cantonal statutory minimum where higher, else federal NAV baseline
  hasCantonalMinWage: boolean;
};

// Federal NAV Hauswirtschaft minimum (2026, ungelernt). Cantons without a higher
// statutory minimum fall back to this for the soft min-wage hint.
export const FEDERAL_MIN_WAGE_CHF = 19.45;

// Zürich keeps the app's established defaults exactly (FAK 1.025 %, Feiertage
// 3.59 % = 9 wirksame Feiertage), so existing ZH households see zero change.
// Feiertags-% for the other cantons is derived from the public-holiday count using
// ZH's ratio (3.59 % ÷ 9 ≈ 0.399 %/Feiertag) and rounded to 2 decimals.
export const CANTON_PRESETS: CantonPreset[] = [
  { code: 'AG', name: 'Aargau',                  ausgleichskasse: 'SVA Aargau',                       fakEmployer: 1.50, holidayPercent: 4.79, holidayCount: 12, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'AI', name: 'Appenzell Innerrhoden',   ausgleichskasse: 'Ausgleichskasse Appenzell I.Rh.', fakEmployer: 1.10, holidayPercent: 4.79, holidayCount: 12, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'AR', name: 'Appenzell Ausserrhoden',  ausgleichskasse: 'Ausgleichskasse Appenzell A.Rh.', fakEmployer: 1.20, holidayPercent: 3.59, holidayCount: 9,  minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'BE', name: 'Bern',                    ausgleichskasse: 'Ausgleichskasse Bern',             fakEmployer: 1.60, holidayPercent: 3.59, holidayCount: 9,  minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'BL', name: 'Basel-Landschaft',        ausgleichskasse: 'Ausgleichskasse Basel-Landschaft', fakEmployer: 1.60, holidayPercent: 3.59, holidayCount: 9,  minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'BS', name: 'Basel-Stadt',             ausgleichskasse: 'Ausgleichskasse Basel-Stadt',      fakEmployer: 1.80, holidayPercent: 3.59, holidayCount: 9,  minWageChf: 22.20, hasCantonalMinWage: true },
  { code: 'FR', name: 'Freiburg',                ausgleichskasse: 'Ausgleichskasse des Kantons Freiburg', fakEmployer: 2.20, holidayPercent: 5.58, holidayCount: 14, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'GE', name: 'Genf',                    ausgleichskasse: 'Caisse cantonale genevoise (OCAS)', fakEmployer: 2.30, holidayPercent: 3.59, holidayCount: 9,  minWageChf: 24.59, hasCantonalMinWage: true },
  { code: 'GL', name: 'Glarus',                  ausgleichskasse: 'Ausgleichskasse Glarus',           fakEmployer: 1.20, holidayPercent: 4.39, holidayCount: 11, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'GR', name: 'Graubünden',              ausgleichskasse: 'Ausgleichskasse Graubünden',       fakEmployer: 1.40, holidayPercent: 4.39, holidayCount: 11, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'JU', name: 'Jura',                    ausgleichskasse: 'Caisse de compensation du Jura',   fakEmployer: 2.10, holidayPercent: 4.79, holidayCount: 12, minWageChf: 21.40, hasCantonalMinWage: true },
  { code: 'LU', name: 'Luzern',                  ausgleichskasse: 'Ausgleichskasse Luzern (WAS)',     fakEmployer: 1.50, holidayPercent: 5.98, holidayCount: 15, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'NE', name: 'Neuenburg',               ausgleichskasse: 'Caisse cantonale neuchâteloise',   fakEmployer: 2.00, holidayPercent: 3.59, holidayCount: 9,  minWageChf: 21.35, hasCantonalMinWage: true },
  { code: 'NW', name: 'Nidwalden',               ausgleichskasse: 'Ausgleichskasse Nidwalden',        fakEmployer: 1.00, holidayPercent: 5.19, holidayCount: 13, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'OW', name: 'Obwalden',                ausgleichskasse: 'Ausgleichskasse Obwalden',         fakEmployer: 1.10, holidayPercent: 5.58, holidayCount: 14, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'SG', name: 'St. Gallen',              ausgleichskasse: 'SVA St. Gallen',                   fakEmployer: 1.50, holidayPercent: 3.59, holidayCount: 9,  minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'SH', name: 'Schaffhausen',            ausgleichskasse: 'Ausgleichskasse Schaffhausen',     fakEmployer: 1.30, holidayPercent: 3.99, holidayCount: 10, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'SO', name: 'Solothurn',               ausgleichskasse: 'Ausgleichskasse Solothurn',        fakEmployer: 1.40, holidayPercent: 5.98, holidayCount: 15, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'SZ', name: 'Schwyz',                  ausgleichskasse: 'Ausgleichskasse Schwyz',           fakEmployer: 1.20, holidayPercent: 5.58, holidayCount: 14, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'TG', name: 'Thurgau',                 ausgleichskasse: 'Ausgleichskasse Thurgau',          fakEmployer: 1.40, holidayPercent: 3.99, holidayCount: 10, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'TI', name: 'Tessin',                  ausgleichskasse: 'Istituto delle assicurazioni sociali (IAS)', fakEmployer: 1.50, holidayPercent: 5.98, holidayCount: 15, minWageChf: 20.00, hasCantonalMinWage: true },
  { code: 'UR', name: 'Uri',                     ausgleichskasse: 'Ausgleichskasse Uri',              fakEmployer: 1.10, holidayPercent: 5.58, holidayCount: 14, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'VD', name: 'Waadt',                   ausgleichskasse: 'Caisse cantonale vaudoise (CCVD)', fakEmployer: 2.80, holidayPercent: 3.59, holidayCount: 9,  minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'VS', name: 'Wallis',                  ausgleichskasse: 'Ausgleichskasse Wallis',           fakEmployer: 1.90, holidayPercent: 3.59, holidayCount: 9,  minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'ZG', name: 'Zug',                     ausgleichskasse: 'Ausgleichskasse Zug',              fakEmployer: 1.00, holidayPercent: 5.19, holidayCount: 13, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false },
  { code: 'ZH', name: 'Zürich',                  ausgleichskasse: 'SVA Zürich',                       fakEmployer: 1.025, holidayPercent: 3.59, holidayCount: 9, minWageChf: FEDERAL_MIN_WAGE_CHF, hasCantonalMinWage: false }
];

const BY_CODE = new Map(CANTON_PRESETS.map(c => [c.code, c]));

export function cantonPreset(code: string | null | undefined): CantonPreset | null {
  return code ? BY_CODE.get(code) ?? null : null;
}

// Name of the canton's Ausgleichskasse for labels, with a generic fallback when no
// canton is chosen yet.
export function ausgleichskasseLabel(code: string | null | undefined): string {
  return cantonPreset(code)?.ausgleichskasse ?? 'Ausgleichskasse';
}

export function cantonName(code: string | null | undefined): string {
  return cantonPreset(code)?.name ?? '';
}
