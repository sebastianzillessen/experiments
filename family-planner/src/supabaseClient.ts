// Supabase client for the Familienplaner. Same project as Salärli — the auth
// user, the magic link and the password are shared; only the tables and the
// roles differ. Mirrors kinderbetreuung-lohn/src/supabaseClient.ts so both
// apps behave identically around magic links and invite URLs.

import { createClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    __APP_CONFIG?: { url?: string; key?: string };
    __APP_VERSION?: { commit?: string; builtAt?: string };
    __APP_ENV?: string;
  }
}

const SUPABASE_URL = window.__APP_CONFIG?.url;
const SUPABASE_KEY = window.__APP_CONFIG?.key;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  document.body.innerHTML = '<p style="font-family:system-ui;padding:24px">Konfiguration fehlt: <code>config.js</code> nicht geladen oder unvollst&auml;ndig.</p>';
  throw new Error('Missing window.__APP_CONFIG');
}

// A failed verify redirect leaves #error=…&error_description=… in the URL.
// Capture (and strip) it BEFORE the client initialises, otherwise the client's
// own URL detection consumes the hash first.
export const hadAuthErrorInUrl = location.hash.includes('error');
if (hadAuthErrorInUrl) {
  history.replaceState(null, '', location.pathname + location.search);
}

// Invitations arrive as …?invite=<token>. Mirror the token into sessionStorage
// so it survives the redirect round-trips of a magic-link signup.
const PENDING_INVITE_KEY = 'fp_pending_invite_token';
let _pendingInviteToken: string | null = null;
try {
  const fromUrl = new URLSearchParams(location.search).get('invite');
  if (fromUrl) {
    _pendingInviteToken = fromUrl;
    sessionStorage.setItem(PENDING_INVITE_KEY, fromUrl);
  } else {
    _pendingInviteToken = sessionStorage.getItem(PENDING_INVITE_KEY);
  }
} catch { /* sessionStorage unavailable — fall back to the in-memory value */ }

export function getPendingInviteToken(): string | null {
  return _pendingInviteToken;
}

export function clearPendingInviteToken(): void {
  _pendingInviteToken = null;
  try { sessionStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
  try {
    const url = new URL(location.href);
    if (url.searchParams.has('invite')) {
      url.searchParams.delete('invite');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  } catch { /* ignore */ }
}

// Module-scope singleton — created exactly once per page load so an implicit
// magic-link token in the URL hash is consumed exactly once.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, flowType: 'implicit' },
});
