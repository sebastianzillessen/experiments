// Developer tools, available only on non-production environments (local dev and
// Cloudflare preview deployments). They let us exercise the onboarding tutorials
// on existing, fully set-up accounts by force-showing them regardless of the
// completion/dismissal state.

import { useSyncExternalStore } from 'react';

declare global {
  interface Window {
    // Set by build.sh in the generated config.js: 'production' only on the
    // main-branch deploy, 'preview' on Cloudflare branch/commit previews.
    // Undefined for local dev (config.example.js) — treated as non-production.
    __APP_ENV?: string;
    // Test/override seam: when set to a boolean it wins over __APP_ENV.
    __SALAERLI_FORCE_PREVIEW?: boolean;
  }
}

// Is this a non-production environment where the developer menu should appear?
// Driven by the build-time env flag: production deploys (main branch) set
// window.__APP_ENV = 'production'; Cloudflare preview deploys set 'preview', and
// local dev leaves it undefined. Anything that is not explicitly 'production'
// counts as non-production.
export function isPreviewEnv(): boolean {
  if (typeof window.__SALAERLI_FORCE_PREVIEW === 'boolean') return window.__SALAERLI_FORCE_PREVIEW;
  return window.__APP_ENV !== 'production';
}

export type DevFlags = {
  forceAdminOnboarding: boolean;
  forceEmployeeTutorial: boolean;
};

const DEFAULTS: DevFlags = { forceAdminOnboarding: false, forceEmployeeTutorial: false };
const KEY = 'salaerli-dev-flags';

function read(): DevFlags {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DevFlags>) };
  } catch { return DEFAULTS; }
}

let cache: DevFlags = read();
const listeners = new Set<() => void>();

export function getDevFlags(): DevFlags { return cache; }

export function setDevFlags(patch: Partial<DevFlags>): void {
  cache = { ...cache, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* ignore quota/availability */ }
  listeners.forEach(l => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// React binding — re-renders subscribers whenever a flag changes, no reload needed.
export function useDevFlags(): DevFlags {
  return useSyncExternalStore(subscribe, getDevFlags, getDevFlags);
}

// Clear the per-user tutorial dismissal flags (keys written by Onboarding.tsx),
// so the tutorials behave as they would for a brand-new user.
export function resetTutorialDismissals(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('salaerli-tutorial:')) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
