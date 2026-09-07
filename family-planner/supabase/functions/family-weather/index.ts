// Supabase Edge Function: family-weather
//
// Fetches the forecast for the family's postal code and narrows it to the
// hours they plan in. Runs on the server for two reasons: MeteoSwiss sends no
// CORS header, so a browser cannot ask it at all, and one fetch an hour then
// serves every screen instead of one per viewer.
//
//   POST { family_id: uuid, force?: boolean }
//   → { days: [{ date, tempMin, tempMax, precipitation, sunshine, hours }],
//       plz, fetched_at, status: 'fetched' | 'cached' }
//
// The endpoint behind this is the one the MeteoSwiss app uses. It is not
// documented and may change without notice — so a failure here reports itself
// and leaves the last good forecast in place rather than clearing it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';
import { daytimeForecast, plzQuery } from './weather.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SOURCE = 'https://app-prod-ws.meteoswiss-app.ch/v1/plzDetail';
const TTL_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 2 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function fetchForecast(query: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${SOURCE}?plz=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Familienplaner/1.0' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`MeteoSchweiz antwortete mit HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error('Die Wetterdaten sind zu gross');
    return JSON.parse(new TextDecoder().decode(buf));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Zeitüberschreitung beim Abrufen des Wetters');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: { family_id?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const familyId = body.family_id;
  if (!familyId) return jsonResponse({ error: 'family_id required' }, 400);

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Any role may refresh: looking at the weather changes nothing.
  const { data: membership } = await admin
    .from('fp_memberships')
    .select('role')
    .eq('family_id', familyId)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (!membership) return jsonResponse({ error: 'Forbidden' }, 403);

  const { data: family } = await admin
    .from('fp_families').select('timezone, weather_plz').eq('id', familyId).maybeSingle();
  const plz = (family?.weather_plz as string | null) ?? '';
  const query = plzQuery(plz);
  if (!query) return jsonResponse({ error: 'Für diese Familie ist keine PLZ hinterlegt' }, 400);
  const tz = (family?.timezone as string) || 'Europe/Zurich';

  const { data: cache } = await admin
    .from('fp_weather_cache')
    .select('plz, days, fetched_at')
    .eq('family_id', familyId)
    .maybeSingle();

  // A changed postal code invalidates the cache whatever its age says.
  const fresh = cache
    && cache.plz === plz
    && Date.now() - Date.parse(cache.fetched_at as string) < TTL_MS;
  if (fresh && !body.force) {
    return jsonResponse({
      days: cache!.days, plz, fetched_at: cache!.fetched_at, status: 'cached',
    });
  }

  let days;
  try {
    const payload = await fetchForecast(query) as { graph?: Parameters<typeof daytimeForecast>[0] };
    days = daytimeForecast(payload.graph ?? {}, tz);
    if (days.length === 0) throw new Error('Keine Vorhersage erhalten');
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Das Wetter konnte nicht geholt werden';
    // Leave whatever is cached in place: a stale forecast beats an empty
    // column, and the caller is told the refresh failed.
    return jsonResponse({ error: message.slice(0, 200) }, 502);
  }

  const fetchedAt = new Date().toISOString();
  const { error: storeErr } = await admin.from('fp_weather_cache').upsert({
    family_id: familyId, plz, days, fetched_at: fetchedAt,
  }, { onConflict: 'family_id' });
  if (storeErr) return jsonResponse({ error: 'Das Wetter konnte nicht gespeichert werden' }, 500);

  return jsonResponse({ days, plz, fetched_at: fetchedAt, status: 'fetched' });
});
