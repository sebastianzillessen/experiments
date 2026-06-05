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

// Module-scope singleton — created exactly once per page load so the implicit
// magic-link token in the URL hash is consumed exactly once (mirrors vanilla).
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, flowType: 'implicit' }
});
