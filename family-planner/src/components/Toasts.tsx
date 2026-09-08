import { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { UpdatePrompt } from './UpdatePrompt.tsx';

/**
 * Everything that speaks up while the plan stays where it is.
 *
 * These used to sit in the flow above the table, so a sync starting pushed the
 * whole week down and finishing pushed it back — on a phone that moved the row
 * you were reading out from under you. They float now.
 */
export function Toasts() {
  const { sync } = useApp();
  // An error stays until something clears it, which as a floating box means
  // until it is closed. Keyed on the text, so the next failure speaks up again.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const error = sync.error && sync.error !== dismissed ? sync.error : null;

  return (
    <div className="toasts no-print">
      {sync.busy && (
        <div className="toast info" role="status">
          {sync.message ?? 'Wird abgerufen …'}
        </div>
      )}
      {error && (
        <div className="toast danger" role="alert">
          <span className="grow">{error}</span>
          <button className="toast-close" aria-label="Schliessen"
            onClick={() => setDismissed(error)}>×</button>
        </div>
      )}
      <UpdatePrompt />
    </div>
  );
}
