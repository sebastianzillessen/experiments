// In-app tutorials for new users:
//  - OnboardingBanner: a guided 3-step checklist for a fresh admin/owner that
//    sits below the tab nav and ticks itself off as the household is set up.
//  - EmployeeTutorial: a short how-to shown to a freshly onboarded employee on
//    the Stundenerfassung tab.
// Both are dismissible; the dismissal is remembered per user in localStorage.

import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useApp } from '../context/AppContext';
import { currentStepIndex, isAdminRole, onboardingSteps } from '../lib/onboarding';
import { useDevFlags } from '../lib/devtools';

// Per-user, per-tutorial dismissal flag persisted in localStorage. Keyed by the
// user id so a shared device shows each person their own tutorial state.
function useDismissed(user: User | null, kind: string): [boolean, () => void] {
  const key = user ? `salaerli-tutorial:${kind}:${user.id}` : null;
  const read = useCallback((k: string | null) => {
    if (!k) return false;
    try { return localStorage.getItem(k) === '1'; } catch { return false; }
  }, []);
  const [dismissed, setDismissed] = useState<boolean>(() => read(key));

  useEffect(() => { setDismissed(read(key)); }, [key, read]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (!key) return;
    try { localStorage.setItem(key, '1'); } catch { /* ignore quota/availability */ }
  }, [key]);

  return [dismissed, dismiss];
}

export function OnboardingBanner() {
  const { role, data, user, activeTab, showTab } = useApp();
  const { forceAdminOnboarding } = useDevFlags();
  const [dismissed, dismiss] = useDismissed(user, 'admin-setup');

  const steps = onboardingSteps(data);
  const currentIdx = currentStepIndex(steps);

  // Normal gating: only admins, only until dismissed or all steps done. The
  // developer menu can force the banner on for testing on existing accounts.
  if (!forceAdminOnboarding) {
    if (!isAdminRole(role) || dismissed) return null;
    if (currentIdx === -1) return null; // all steps complete — nothing to show
  }

  const doneCount = steps.filter(s => s.done).length;

  return (
    <div className="onboarding-wrap no-print">
      <div className="onboarding" role="region" aria-label="Erste Schritte">
        <div className="onboarding-head">
          <h3>👋 Willkommen bei Salärli — so richtest du deinen Haushalt ein</h3>
          {forceAdminOnboarding ? (
            <span className="onboarding-preview-badge">Developer-Vorschau</span>
          ) : (
            <button type="button" className="onboarding-dismiss" onClick={dismiss}>
              Tutorial ausblenden
            </button>
          )}
        </div>
        <p className="onboarding-intro">
          Du hast deinen Haushalt angelegt. In {steps.length} Schritten ist alles startklar
          ({doneCount}/{steps.length} erledigt). Den Assistenten kannst du jederzeit ausblenden.
        </p>
        <ol className="onboarding-steps">
          {steps.map((s, i) => {
            const cls = s.done ? 'done' : i === currentIdx ? 'current' : 'upcoming';
            const isHere = i === currentIdx && activeTab === s.tab;
            return (
              <li key={s.id} className={`onboarding-step ${cls}`}>
                <span className="onboarding-step-marker" aria-hidden="true">
                  {s.done ? '✓' : i + 1}
                </span>
                <div className="onboarding-step-body">
                  <div className="onboarding-step-title">{s.title}</div>
                  {i === currentIdx && (
                    <div className="onboarding-step-desc">{s.description}</div>
                  )}
                </div>
                {i === currentIdx && (
                  isHere ? (
                    <span className="onboarding-here" aria-hidden="true">Du bist hier ↓</span>
                  ) : (
                    <button type="button" className="btn btn-small"
                      data-onboarding-go={s.id}
                      onClick={() => showTab(s.tab)}>
                      Los geht&rsquo;s
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// Shown on the Stundenerfassung tab to an employee who just joined a household,
// explaining how to log their hours. Disappears once dismissed.
export function EmployeeTutorial() {
  const { role, user } = useApp();
  const { forceEmployeeTutorial } = useDevFlags();
  const [dismissed, dismiss] = useDismissed(user, 'employee-shifts');

  // Normal gating: only employees, only until dismissed. The developer menu can
  // force it on so any account can preview it.
  if (!forceEmployeeTutorial && (role !== 'employee' || dismissed)) return null;

  return (
    <div className="onboarding no-print" role="region" aria-label="Tutorial Stundenerfassung"
      style={{ marginTop: 0 }}>
      <div className="onboarding-head">
        <h3>👋 Willkommen! So erfasst du deine Stunden</h3>
        {forceEmployeeTutorial ? (
          <span className="onboarding-preview-badge">Developer-Vorschau</span>
        ) : (
          <button type="button" className="onboarding-dismiss" onClick={dismiss}>
            Verstanden
          </button>
        )}
      </div>
      <p className="onboarding-intro">
        Du gehörst jetzt zum Haushalt. Erfasse jeden Einsatz mit wenigen Klicks im Feld
        <strong> „Neuer Einsatz“</strong> direkt unter diesem Hinweis:
      </p>
      <ol className="onboarding-steps">
        <li className="onboarding-step current">
          <span className="onboarding-step-marker" aria-hidden="true">1</span>
          <div className="onboarding-step-body">
            <div className="onboarding-step-title">Datum wählen</div>
            <div className="onboarding-step-desc">Wähle den Tag deines Einsatzes (Standard ist heute).</div>
          </div>
        </li>
        <li className="onboarding-step current">
          <span className="onboarding-step-marker" aria-hidden="true">2</span>
          <div className="onboarding-step-body">
            <div className="onboarding-step-title">Stunden eintragen</div>
            <div className="onboarding-step-desc">Trage die geleisteten Stunden ein, z.&nbsp;B. 4.5. Eine Notiz ist optional.</div>
          </div>
        </li>
        <li className="onboarding-step current">
          <span className="onboarding-step-marker" aria-hidden="true">3</span>
          <div className="onboarding-step-body">
            <div className="onboarding-step-title">Einsatz hinzufügen</div>
            <div className="onboarding-step-desc">Tippe auf „Einsatz hinzufügen“. Dein Eintrag erscheint sofort in der Liste unten und wird automatisch gespeichert.</div>
          </div>
        </li>
      </ol>
    </div>
  );
}
