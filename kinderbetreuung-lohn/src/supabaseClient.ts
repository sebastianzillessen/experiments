import { createClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    __APP_CONFIG?: { url?: string; key?: string };
  }
}

const SUPABASE_URL = window.__APP_CONFIG?.url;
const SUPABASE_KEY = window.__APP_CONFIG?.key;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  document.body.innerHTML = '<p style="font-family:system-ui;padding:24px">Konfiguration fehlt: <code>config.js</code> nicht geladen oder unvollst&auml;ndig.</p>';
  throw new Error('Missing window.__APP_CONFIG');
}

// Capture auth errors delivered in the URL hash (e.g. an expired magic link:
// #error=access_denied&error_code=otp_expired&…) BEFORE the Supabase client
// initialises — it may strip the hash during its own URL detection.
function consumeAuthErrorFromUrl(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const code = params.get('error_code');
  const desc = params.get('error_description');
  if (!params.get('error') && !code) return null;
  // Strip the error hash so a reload doesn't re-show a stale message.
  history.replaceState(null, '', window.location.pathname + window.location.search);
  if (code === 'otp_expired') {
    return 'Anmelde-Link ungültig oder abgelaufen. Bitte unten einen neuen Link anfordern.';
  }
  return 'Anmeldung fehlgeschlagen: ' + (desc || code || 'unbekannter Fehler');
}

export const initialAuthError = consumeAuthErrorFromUrl();

// Module-scope singleton — created exactly once per page load so the implicit
// magic-link token in the URL hash is consumed exactly once (mirrors vanilla).
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, flowType: 'implicit' }
});
