// Onboarding/tutorial logic. Derives the setup progress of a household purely
// from the already-loaded AppState, so no extra DB columns or round-trips are
// needed — the checklist ticks itself off as the admin fills the app.

import type { AppState } from './state';
import type { Role, TabId } from '../context/AppContext';

export type OnboardingStepId = 'stammdaten' | 'einstellungen' | 'mitarbeitende';

export type OnboardingStep = {
  id: OnboardingStepId;
  tab: TabId;
  title: string;
  description: string;
  done: boolean;
};

// Only owner/admin go through the household-setup tutorial. Employees get the
// shift-entry tutorial on the Stundenerfassung tab instead.
export function isAdminRole(role: Role | null): boolean {
  return role === 'owner' || role === 'admin';
}

// The employer master data counts as filled once name + full address are set —
// that is what actually has to appear on every Lohnabrechnung.
export function employerComplete(data: AppState): boolean {
  const e = data.employer;
  return !!(e.name.trim() && e.address.trim() && e.zip.trim() && e.city.trim());
}

// Steps in the order an admin should tackle them: master data → contribution
// rates → employees (where a login can be linked).
export function onboardingSteps(data: AppState): OnboardingStep[] {
  return [
    {
      id: 'stammdaten',
      tab: 'stammdaten',
      title: 'Stammdaten erfassen',
      description: 'Trage Name und Adresse des Arbeitgeber-Haushalts ein. Diese Angaben erscheinen auf jeder Lohnabrechnung.',
      done: employerComplete(data)
    },
    {
      id: 'einstellungen',
      tab: 'einstellungen',
      title: 'Beitragssätze festlegen',
      description: 'Lege eine erste Version der Beitragssätze (Sozialversicherung, Quellensteuer, UVG) an. Sie gelten haushaltsweit für alle Mitarbeitenden.',
      done: data.paySettings.length > 0
    },
    {
      id: 'mitarbeitende',
      tab: 'mitarbeitende',
      title: 'Mitarbeitende anlegen',
      description: 'Lege jede betreuende Person mit Stammdaten und Stundenlohn an. Tipp: Du kannst eine Person per E-Mail einladen und mit einem Login verknüpfen — dann erfasst sie ihre Stunden selbst.',
      done: data.employees.length > 0
    }
  ];
}

// Index of the first not-yet-done step (the one the tutorial points to). -1 when
// everything is complete.
export function currentStepIndex(steps: OnboardingStep[]): number {
  return steps.findIndex(s => !s.done);
}
