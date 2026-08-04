import { createClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    __APP_CONFIG?: { url?: string; key?: string };
    __APP_VERSION?: { commit?: string; builtAt?: string };
  }
}

const SUPABASE_URL = window.__APP_CONFIG?.url;
const SUPABASE_KEY = window.__APP_CONFIG?.key;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  document.body.innerHTML = '<p style="font-family:system-ui;padding:24px">Konfiguration fehlt: <code>config.js</code> nicht geladen oder unvollst&auml;ndig.</p>';
  throw new Error('Missing window.__APP_CONFIG');
}

// A failed Supabase verify redirect leaves #error=...&error_description=... in
// the URL. Capture (and strip) it BEFORE the client initialises — the client's
// own URL detection may otherwise consume the hash before bootstrap runs.
export const hadAuthErrorInUrl = location.hash.includes('error');
if (hadAuthErrorInUrl) {
  history.replaceState(null, '', location.pathname + location.search);
}

// Link invitations arrive as …?invite=<token>. Capture the token at load and
// mirror it into sessionStorage so it survives the redirect round-trips of a
// magic-link / e-mail-confirmation signup (which replace the URL). It is passed
// as signup metadata and consumed server-side; this copy is the client-side
// fallback + a way to greet the invitee with the household name.
const PENDING_INVITE_KEY = 'pending_invite_token';
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

// Called once the token has been consumed (or is no longer relevant): forget it
// and strip ?invite=… from the address bar so a reload does not re-trigger it.
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

// Module-scope singleton — created exactly once per page load so the implicit
// magic-link token in the URL hash is consumed exactly once (mirrors vanilla).
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, flowType: 'implicit' }
});
