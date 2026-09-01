// Supabase Edge Function: family-calendar-sync
//
// The only place in the system that ever sees a calendar URL or its
// credentials. Called by the Familienplaner frontend with the signed-in
// user's JWT:
//
//   POST { family_id: uuid, force?: boolean, calendar_id?: uuid }
//   → { calendars: [{ id, label, status, event_count, error }] }
//
// Flow per request:
//   1. verify the JWT, then verify the caller is a member of that family
//      (any role — a viewer may refresh the plan, they just cannot change it),
//   2. read fp_calendars + fp_calendar_secrets with the service-role key,
//   3. skip calendars whose cache is still inside ttl_minutes (unless force),
//   4. fetch the ICS over https (Basic auth optional, ETag, timeout, size cap),
//   5. expand it into the planner window and upsert fp_calendar_cache.
//
// The URL never leaves the function: not in the response, not in last_error,
// not in a log line.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// provided by the runtime. No further configuration.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';
import { addDaysToKey, expandIcs, toDateKey, wallClockIn } from './ics.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// How far the cached window reaches. Wide enough to page back through the
// school year and forward through next summer's holidays.
const WINDOW_DAYS_BACK = 92;
const WINDOW_DAYS_AHEAD = 400;

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;

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

/**
 * Never let a URL (or anything that looks like one) escape through an error
 * message — last_error is readable by every family member.
 */
function sanitizeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? 'Unbekannter Fehler');
  return raw
    .replace(/[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+/g, '[URL]')
    .replace(/\b[\w.-]+\.(com|net|org|ch|de|io|dev)\b\S*/gi, '[Host]')
    .slice(0, 200);
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal)$/i;
const PRIVATE_IPV4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * Accept only public https endpoints. webcal:// is the same feed with a
 * different scheme name, so it is rewritten rather than rejected. This blocks
 * the obvious SSRF shapes (file://, http://, link-local metadata services);
 * a hostname that only resolves to a private address at DNS time is out of
 * reach here, which is why the function holds no other credentials.
 */
function assertSafeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Ungültige Kalender-URL');
  }
  if (url.protocol === 'webcal:') url.protocol = 'https:';
  if (url.protocol !== 'https:') {
    throw new Error('Nur https-Kalender-URLs werden unterstützt');
  }
  const host = url.hostname.toLowerCase();
  if (PRIVATE_HOST.test(host) || PRIVATE_IPV4.test(host) || host === '::1' || host.startsWith('[fd')) {
    throw new Error('Diese Adresse ist nicht erreichbar');
  }
  return url.toString();
}

async function fetchIcs(url: string, username: string | null, password: string | null, etag: string | null) {
  const headers: Record<string, string> = {
    Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5',
    'User-Agent': 'Familienplaner/1.0 (+https://planer.zillessen.dev)',
  };
  if (username) headers.Authorization = 'Basic ' + btoa(`${username}:${password ?? ''}`);
  if (etag) headers['If-None-Match'] = etag;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    if (res.status === 304) return { notModified: true as const, text: '', etag };
    if (!res.ok) throw new Error(`Kalender antwortete mit HTTP ${res.status}`);

    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_BYTES) throw new Error('Kalender ist zu gross');
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error('Kalender ist zu gross');

    return {
      notModified: false as const,
      text: new TextDecoder('utf-8').decode(buf),
      etag: res.headers.get('etag'),
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Zeitüberschreitung beim Abrufen des Kalenders');
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

  let body: { family_id?: string; force?: boolean; calendar_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const familyId = body.family_id;
  if (!familyId) return jsonResponse({ error: 'family_id required' }, 400);

  // 1. Who is calling?
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // 2. Are they in this family? Checked explicitly — the service-role client
  //    below bypasses RLS.
  const { data: membership } = await admin
    .from('fp_memberships')
    .select('role')
    .eq('family_id', familyId)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (!membership) return jsonResponse({ error: 'Forbidden' }, 403);

  const { data: family } = await admin
    .from('fp_families')
    .select('timezone')
    .eq('id', familyId)
    .maybeSingle();
  const tz = family?.timezone || 'Europe/Zurich';

  const today = wallClockIn(Date.now(), tz);
  const todayKey = toDateKey(today.y, today.m, today.d);
  const windowFrom = addDaysToKey(todayKey, -WINDOW_DAYS_BACK);
  const windowTo = addDaysToKey(todayKey, WINDOW_DAYS_AHEAD);

  let query = admin
    .from('fp_calendars')
    .select('id, label, enabled, kind, ttl_minutes, last_synced_at')
    .eq('family_id', familyId)
    .eq('enabled', true)
    .eq('kind', 'ics');
  if (body.calendar_id) query = query.eq('id', body.calendar_id);
  const { data: calendars, error: calErr } = await query;
  if (calErr) return jsonResponse({ error: 'Kalender konnten nicht geladen werden' }, 500);

  const results: { id: string; label: string; status: string; event_count: number; error: string | null }[] = [];

  for (const cal of calendars ?? []) {
    const { data: cache } = await admin
      .from('fp_calendar_cache')
      .select('etag, event_count, fetched_at')
      .eq('calendar_id', cal.id)
      .maybeSingle();

    // 3. Still fresh? Then this is a no-op — that is the whole point of caching
    //    a feed several viewers open at once.
    const ttlMs = (cal.ttl_minutes ?? 30) * 60_000;
    const lastSynced = cal.last_synced_at ? Date.parse(cal.last_synced_at) : 0;
    const fresh = Boolean(cache) && Date.now() - lastSynced < ttlMs;
    if (fresh && !body.force) {
      results.push({ id: cal.id, label: cal.label, status: 'cached', event_count: cache?.event_count ?? 0, error: null });
      continue;
    }

    try {
      const { data: secret, error: secretErr } = await admin
        .from('fp_calendar_secrets')
        .select('url, username, password')
        .eq('calendar_id', cal.id)
        .maybeSingle();
      if (secretErr || !secret) throw new Error('Keine Kalender-Adresse hinterlegt');

      const url = assertSafeUrl(secret.url);
      const fetched = await fetchIcs(url, secret.username, secret.password, cache?.etag ?? null);

      if (fetched.notModified) {
        await admin.from('fp_calendars')
          .update({ last_synced_at: new Date().toISOString(), last_error: null })
          .eq('id', cal.id);
        results.push({ id: cal.id, label: cal.label, status: 'not_modified', event_count: cache?.event_count ?? 0, error: null });
        continue;
      }

      const events = expandIcs(fetched.text, { from: windowFrom, to: windowTo, tz });

      const { error: upsertErr } = await admin.from('fp_calendar_cache').upsert({
        calendar_id: cal.id,
        family_id: familyId,
        fetched_at: new Date().toISOString(),
        window_from: windowFrom,
        window_to: windowTo,
        etag: fetched.etag,
        event_count: events.length,
        events,
      }, { onConflict: 'calendar_id' });
      if (upsertErr) throw new Error('Zwischenspeicher konnte nicht geschrieben werden');

      await admin.from('fp_calendars')
        .update({ last_synced_at: new Date().toISOString(), last_error: null })
        .eq('id', cal.id);

      results.push({ id: cal.id, label: cal.label, status: 'synced', event_count: events.length, error: null });
    } catch (e) {
      const message = sanitizeError(e);
      await admin.from('fp_calendars')
        .update({ last_synced_at: new Date().toISOString(), last_error: message })
        .eq('id', cal.id);
      results.push({ id: cal.id, label: cal.label, status: 'error', event_count: cache?.event_count ?? 0, error: message });
    }
  }

  return jsonResponse({ calendars: results, window: { from: windowFrom, to: windowTo }, timezone: tz });
});
