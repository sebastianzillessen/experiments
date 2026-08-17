// Verbatim port of the formatters from the vanilla app.js. Output must stay
// byte-identical — the e2e tests and the visual baselines assert on it.

export function fmtChf(n: number): string {
  if (!isFinite(n)) n = 0;
  return n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function round2(n: number): number { return Math.round(n * 100) / 100; }

// Swiss Rappenrundung: payable amounts settle on the 5-Rappen grid. The SVA
// calculator rounds the wage components, the Bruttolohn and the Nettolohn this
// way, so we match it for those figures (contribution line items stay at
// Rappen precision, exactly as on the SVA breakdown).
export function round5(n: number): number { return Math.round(n * 20) / 20; }

// Display labels for the membership roles (DB values stay owner/admin/employee).
const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin', employee: 'Mitarbeitende/r' };
export function roleLabel(role: string): string { return ROLE_LABELS[role] || role; }

export function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number);
  const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${months[m - 1]} ${y}`;
}

export function fmtNum(n: number): string {
  return n.toLocaleString('de-CH');
}

// "HH:MM" (or "HH:MM:SS") → "H:MM" for display, e.g. "07:30" → "7:30".
export function fmtTime(t: string): string {
  const [h, m] = t.split(':');
  return `${Number(h)}:${m ?? '00'}`;
}

// Entries-overview label: "7:30-17:00" when both times are set, the note when
// only a note exists, and "7:30-17:00: note" when both are present.
export function shiftNoteLabel(startTime: string | null, endTime: string | null, note: string): string {
  const range = (startTime && endTime) ? `${fmtTime(startTime)}-${fmtTime(endTime)}` : '';
  if (range && note) return `${range}: ${note}`;
  return range || note;
}

// Hours between two "HH:MM" times, rounded to two decimals. A "Bis" that is not
// after "Von" is treated as crossing midnight (e.g. 22:00–06:00 = 8h), which
// covers overnight childcare. Returns null when either time is missing/invalid
// or the span is zero, so callers can leave the hours untouched.
export function hoursBetweenTimes(from: string, to: string): number | null {
  if (!from || !to) return null;
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  if ([fh, fm, th, tm].some(n => !Number.isFinite(n))) return null;
  let mins = (th * 60 + tm) - (fh * 60 + fm);
  if (mins < 0) mins += 24 * 60; // crossed midnight
  if (mins <= 0) return null;
  return Math.round((mins / 60) * 100) / 100;
}
