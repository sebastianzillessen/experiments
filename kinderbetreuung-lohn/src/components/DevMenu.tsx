// Floating developer menu, rendered only on non-production environments
// (local dev + Cloudflare preview deployments). It lets us exercise the
// onboarding tutorials on existing, fully set-up accounts by force-showing them.

import { useState } from 'react';
import { isPreviewEnv, resetTutorialDismissals, setDevFlags, useDevFlags } from '../lib/devtools';

export function DevMenu() {
  const flags = useDevFlags();
  const [open, setOpen] = useState(false);

  // Decided once per load — preview/dev only.
  if (!isPreviewEnv()) return null;

  return (
    <div className="dev-menu no-print">
      {open && (
        <div className="dev-menu-panel" role="dialog" aria-label="Developer-Menü">
          <div className="dev-menu-title">🛠 Developer-Menü <span>(Preview)</span></div>
          <p className="dev-menu-hint">
            Nur auf Preview-/Entwicklungs-Umgebungen sichtbar. Hier kannst du die
            Tutorials auch mit bestehenden Accounts testen.
          </p>

          <label className="dev-menu-row">
            <input type="checkbox" checked={flags.forceAdminOnboarding}
              onChange={e => setDevFlags({ forceAdminOnboarding: e.target.checked })} />
            <span>Onboarding-Assistent (Admin) erzwingen</span>
          </label>

          <label className="dev-menu-row">
            <input type="checkbox" checked={flags.forceEmployeeTutorial}
              onChange={e => setDevFlags({ forceEmployeeTutorial: e.target.checked })} />
            <span>Mitarbeiter-Tutorial erzwingen (Stundenerfassung)</span>
          </label>

          <button type="button" className="btn btn-small btn-secondary dev-menu-reset"
            onClick={() => { resetTutorialDismissals(); location.reload(); }}>
            Tutorial-Status zurücksetzen &amp; neu laden
          </button>
        </div>
      )}
      <button type="button" className="dev-menu-toggle"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        🛠 DEV
      </button>
    </div>
  );
}
