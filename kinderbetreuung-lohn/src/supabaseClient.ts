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

// Module-scope singleton — created exactly once per page load so the implicit
// magic-link token in the URL hash is consumed exactly once (mirrors vanilla).
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, flowType: 'implicit' }
});
