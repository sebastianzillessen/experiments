import { useEffect } from 'react';
import type { ReactNode } from 'react';

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
    return () => document.removeEventListener('keydown', onKey);
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
