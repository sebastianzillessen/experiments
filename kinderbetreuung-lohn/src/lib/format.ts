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
