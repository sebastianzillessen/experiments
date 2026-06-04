// Verbatim port of the formatters from the vanilla app.js. Output must stay
// byte-identical — the e2e tests and the visual baselines assert on it.

export function fmtChf(n: number): string {
  if (!isFinite(n)) n = 0;
  return n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function round2(n: number): number { return Math.round(n * 100) / 100; }

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
