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
import { normalizeCalendarUrl } from './url.ts';
import { decryptSecret, encryptSecret, isEncrypted } from './crypto.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENCRYPTION_KEY = Deno.env.get('CALENDAR_ENCRYPTION_KEY') ?? null;

// How far the cached window reaches. Wide enough to page back through the
// school year and forward through next summer's holidays.
const WINDOW_DAYS_BACK = 92;
const WINDOW_DAYS_AHEAD = 400;

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;

type SyncBody = { action?: 'sync' | 'save'; family_id?: string; force?: boolean; calendar_id?: string };
type SaveBody = {
  calendar_id?: string;
  label?: string;
  url?: string;
  username?: string;
  password?: string;
  color?: string;
  enabled?: boolean;
};

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

/** last_error is readable by every member, so no URL may leak into it. */
function sanitizeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? 'Unbekannter Fehler');
  return raw
    .replace(/[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+/g, '[URL]')
    .replace(/\b[\w.-]+\.(com|net|org|ch|de|io|dev)\b\S*/gi, '[Host]')
    .slice(0, 200);
}

function truncatedUrlPreview(url: string): string {
  const withoutScheme = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  const host = withoutScheme.split('/')[0];
  const path = withoutScheme.split('?')[0];
  return `${host}/…/${path.slice(-12)}`;
}

/** Runs here rather than as an SQL RPC so only this function sees plaintext. */
async function saveCalendar(
  admin: ReturnType<typeof createClient>,
  familyId: string,
  role: string,
  body: SaveBody,
): Promise<Response> {
  if (role !== 'owner') return jsonResponse({ error: 'Nur der Owner darf Kalender verwalten' }, 403);

  const label = (body.label ?? '').trim();
  if (!label) return jsonResponse({ error: 'Bezeichnung fehlt' }, 400);

  const calendarId = body.calendar_id ?? null;
  const submittedUrl = (body.url ?? '').trim();

  if (!calendarId && !submittedUrl) return jsonResponse({ error: 'Kalender-Adresse fehlt' }, 400);

  let normalizedUrl: string | null = null;
  if (submittedUrl) {
    try {
      normalizedUrl = normalizeCalendarUrl(submittedUrl);
    } catch (e) {
      return jsonResponse({ error: sanitizeError(e) }, 400);
    }
  }

  const writesSecret = Boolean(normalizedUrl || body.username || body.password);
  if (writesSecret && !ENCRYPTION_KEY) {
    return jsonResponse({
      error: 'Verschlüsselung ist nicht konfiguriert — CALENDAR_ENCRYPTION_KEY fehlt auf der Edge Function',
    }, 500);
  }

  let id = calendarId;
  const metadata = {
    label,
    color: body.color ?? '#8a7d64',
    enabled: body.enabled ?? true,
    last_error: null as string | null,
    ...(normalizedUrl ? { url_preview: truncatedUrlPreview(normalizedUrl) } : {}),
  };

  if (id) {
    const { error } = await admin.from('fp_calendars')
      .update(metadata).eq('id', id).eq('family_id', familyId);
    if (error) return jsonResponse({ error: 'Kalender konnte nicht geändert werden' }, 500);
  } else {
    const { data, error } = await admin.from('fp_calendars')
      .insert({ family_id: familyId, kind: 'ics', url_preview: '', ...metadata })
      .select('id').single();
    if (error || !data) return jsonResponse({ error: 'Kalender konnte nicht angelegt werden' }, 500);
    id = data.id as string;
  }

  if (writesSecret) {
    const patch: Record<string, string | null> = { calendar_id: id, updated_at: new Date().toISOString() };
    if (normalizedUrl) patch.url = await encryptSecret(normalizedUrl, ENCRYPTION_KEY!);
    if (body.username) patch.username = await encryptSecret(body.username, ENCRYPTION_KEY!);
    if (body.password) patch.password = await encryptSecret(body.password, ENCRYPTION_KEY!);

    const { error } = await admin.from('fp_calendar_secrets')
      .upsert(patch, { onConflict: 'calendar_id' });
    if (error) return jsonResponse({ error: 'Zugangsdaten konnten nicht gespeichert werden' }, 500);
  }

  return jsonResponse({ calendar_id: id });
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

  let body: SyncBody & SaveBody;
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

  if (body.action === 'save') {
    return saveCalendar(admin, familyId, membership.role as string, body);
  }

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
    const ttlMs = (cal.ttl_minutes ?? 15) * 60_000;
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

      const storedUrl = await decryptSecret(secret.url, ENCRYPTION_KEY);
      const username = await decryptSecret(secret.username, ENCRYPTION_KEY);
      const password = await decryptSecret(secret.password, ENCRYPTION_KEY);
      if (!storedUrl) throw new Error('Keine Kalender-Adresse hinterlegt');

      if (ENCRYPTION_KEY) {
        const stale: Record<string, string> = {};
        if (!isEncrypted(secret.url)) stale.url = await encryptSecret(storedUrl, ENCRYPTION_KEY);
        if (username && !isEncrypted(secret.username)) {
          stale.username = await encryptSecret(username, ENCRYPTION_KEY);
        }
        if (password && !isEncrypted(secret.password)) {
          stale.password = await encryptSecret(password, ENCRYPTION_KEY);
        }
        if (Object.keys(stale).length > 0) {
          await admin.from('fp_calendar_secrets').update(stale).eq('calendar_id', cal.id);
        }
      }

      const url = normalizeCalendarUrl(storedUrl);
      const fetched = await fetchIcs(url, username, password, cache?.etag ?? null);

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
