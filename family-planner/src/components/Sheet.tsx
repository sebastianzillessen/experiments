import { useEffect } from 'react';
import type { ReactNode } from 'react';

// Holding the page still while a sheet is open.
//
// Without this, scrolling inside a sheet carries on into the plan behind it
// once the sheet hits its end — and on a phone the plan is then somewhere else
// when the sheet closes. Counted, because the settings open a second sheet on
// top of the first and the inner one closing must not unlock the page.
let openSheets = 0;
let scrollYBeforeLock = 0;

function lockPage() {
  if (openSheets++ > 0) return;
  scrollYBeforeLock = window.scrollY;
  const style = document.body.style;
  style.position = 'fixed';
  style.top = `-${scrollYBeforeLock}px`;
  style.left = '0';
  style.right = '0';
  style.width = '100%';
}

function unlockPage() {
  if (--openSheets > 0) return;
  const style = document.body.style;
  style.position = '';
  style.top = '';
  style.left = '';
  style.right = '';
  style.width = '';
  window.scrollTo(0, scrollYBeforeLock);
}

// Bottom sheet on a phone, centred dialog on a desktop (see styles.css).
// Escape closes, the backdrop closes, focus stays inside the panel.
export function Sheet({ title, onClose, children, wide }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    lockPage();
    return () => {
      document.removeEventListener('keydown', onKey);
      unlockPage();
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}
        onClick={ev => ev.stopPropagation()}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Schliessen" onClick={onClose}>×</button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
