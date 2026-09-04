// Supabase Edge Function: family-menu-import
//
// Reads the school's weekly lunch menu out of its PDF and hands back checked
// JSON. It does not write anything — the caller shows the week for confirming
// first, because a scan can be misread and a wrong menu is worse than none.
//
//   POST { family_id: uuid, year?: number, week?: number, pdf_base64?: string }
//   → { menu: { year, week, from, to, days: [{ date, dishes: [{ name, tags }] }] },
//       source: 'school' | 'upload', url_tried?: string }
//
// Without `pdf_base64` the function fetches the week itself: the school names
// its files `{week}.{yy}.pdf`. With it, whatever was uploaded is read instead,
// which is the way back in if that naming ever changes.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY come
// from the runtime; CLAUDE_API_KEY is set with `supabase secrets set`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';
import { extractMenuWeek } from './extract.ts';
import { isAllowedMenuUrl, isoWeek, menuPdfCandidates, todayInZone } from './menu.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') ?? null;

const FETCH_TIMEOUT_MS = 20_000;
const MAX_BYTES = 8 * 1024 * 1024;

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

function fromBase64(data: string): Uint8Array {
  const binary = atob(data.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function fetchPdf(url: string): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/pdf', 'User-Agent': 'Familienplaner/1.0' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error('Die Datei ist zu gross');
    const bytes = new Uint8Array(buf);
    // Trust the bytes, not the content type: some servers label a PDF as
    // application/octet-stream.
    const looksLikePdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44;
    return looksLikePdf ? bytes : null;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
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

  let body: { family_id?: string; year?: number; week?: number; pdf_base64?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const familyId = body.family_id;
  if (!familyId) return jsonResponse({ error: 'family_id required' }, 400);

  if (!CLAUDE_API_KEY) {
    return jsonResponse({ error: 'Menü-Import ist nicht konfiguriert — CLAUDE_API_KEY fehlt' }, 500);
  }

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Importing costs money, so this is for people who may change the plan.
  const { data: membership } = await admin
    .from('fp_memberships')
    .select('role')
    .eq('family_id', familyId)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (!membership) return jsonResponse({ error: 'Forbidden' }, 403);
  if (membership.role !== 'owner' && membership.role !== 'editor') {
    return jsonResponse({ error: 'Nur Owner und Bearbeiter dürfen den Menüplan holen' }, 403);
  }

  const { data: family } = await admin
    .from('fp_families').select('timezone').eq('id', familyId).maybeSingle();
  const tz = family?.timezone || 'Europe/Zurich';

  const current = isoWeek(todayInZone(tz));
  const year = Number.isInteger(body.year) ? body.year! : current.year;
  const week = Number.isInteger(body.week) ? body.week! : current.week;
  if (week < 1 || week > 53) return jsonResponse({ error: 'Ungültige Kalenderwoche' }, 400);

  let pdf: Uint8Array | null = null;
  let source: 'school' | 'upload' = 'upload';
  let urlTried: string | undefined;

  if (body.pdf_base64) {
    try {
      pdf = fromBase64(body.pdf_base64);
    } catch {
      return jsonResponse({ error: 'Die hochgeladene Datei konnte nicht gelesen werden' }, 400);
    }
    if (pdf.byteLength > MAX_BYTES) return jsonResponse({ error: 'Die Datei ist zu gross' }, 400);
  } else {
    source = 'school';
    for (const candidate of menuPdfCandidates(year, week)) {
      if (!isAllowedMenuUrl(candidate)) continue;
      urlTried = candidate;
      pdf = await fetchPdf(candidate);
      if (pdf) break;
    }
    if (!pdf) {
      return jsonResponse({
        error: `Für Woche ${week} liegt auf der Schul-Website kein Menüplan — bitte die PDF hochladen`,
      }, 404);
    }
  }

  try {
    const menu = await extractMenuWeek(pdf, year, week, CLAUDE_API_KEY);
    return jsonResponse({ menu, source, url_tried: urlTried });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Der Menüplan konnte nicht gelesen werden';
    return jsonResponse({ error: message.slice(0, 200) }, 502);
  }
});
