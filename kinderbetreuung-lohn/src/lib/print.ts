// Same imperative print flow as the vanilla app: tag the section with the
// `printing` class (print CSS shows only section.printing), print, clean up.
export function printSection(id: string): void {
  document.querySelectorAll('section[role="tabpanel"]').forEach(s => s.classList.remove('printing'));
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('printing');
  const cleanup = () => {
    el.classList.remove('printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
