// Printing an in-place report (Monatsabrechnung / Jahresübersicht).
//
// In a normal browser window.print() works. But an iOS Home-Screen (standalone)
// PWA silently IGNORES window.print() — no print dialog, no events — while the
// same page prints fine in Safari. There we open the already-rendered document
// in a new tab (iOS routes window.open to Safari, where printing works) and print
// it there. The report is self-contained (the QR-bill is an inline data: image),
// so the new tab needs no login or app state.

function isStandalone(): boolean {
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export function printReport(docId: string, title: string): void {
  if (!isStandalone()) {
    window.print();
    return;
  }

  const docEl = document.getElementById(docId);
  // window.open must be called synchronously in the user gesture.
  const win = window.open('', '_blank');
  if (!docEl || !win) {
    window.print(); // popup blocked or nothing to print — best effort
    return;
  }

  const cssHref = document.querySelector<HTMLLinkElement>('link[href*="styles.css"]')?.href;
  const fontHref = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com"]')?.href;
  const head =
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + escapeHtml(title) + '</title>' +
    (fontHref ? '<link rel="stylesheet" href="' + fontHref + '">' : '') +
    (cssHref ? '<link rel="stylesheet" href="' + cssHref + '">' : '');
  // Print once styles and images have settled. Data-URL images decode
  // synchronously, so a short delay after load is enough.
  const autoPrint =
    '<script>addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},350);});<\/script>';

  win.document.open();
  win.document.write(
    '<!doctype html><html lang="de"><head>' + head + '</head><body>' + docEl.innerHTML + autoPrint + '</body></html>'
  );
  win.document.close();
}
