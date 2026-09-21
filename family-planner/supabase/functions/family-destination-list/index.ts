// Supabase Edge Function: family-destination-list
//
// Turns "Hauptstädte in Europa" into a list of places to tick off.
//
//   POST { family_id: uuid, request: string }
//   → { group: "Hauptstädte Europas", note: "", items: [{ name, code }] }
//
// It writes nothing. The screen shows what came back, the family unticks what
// it does not want, and the client writes that — a list nobody looked at is
// exactly the kind of thing that quietly fills a screen with places that do
// not exist.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY come
// from the runtime; CLAUDE_API_KEY is set with `supabase secrets set`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';
import { generateList } from './generate.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') ?? null;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: { family_id?: string; request?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const familyId = body.family_id;
  const request = (body.request ?? '').trim().slice(0, 200);
  if (!familyId) return jsonResponse({ error: 'family_id required' }, 400);
  if (request.length < 3) return jsonResponse({ error: 'Beschreib die Liste in ein paar Worten' }, 400);

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Generating costs money, so this is for people who may change the plan.
  const { data: membership } = await admin
    .from('fp_memberships')
    .select('role')
    .eq('family_id', familyId)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (!membership) return jsonResponse({ error: 'Forbidden' }, 403);
  if (membership.role !== 'owner' && membership.role !== 'editor') {
    return jsonResponse({ error: 'Nur Owner und Bearbeiter dürfen Listen erzeugen' }, 403);
  }

  // Only past the membership check: how this function is configured is nobody
  // else's business, and the anon key is public.
  if (!CLAUDE_API_KEY) {
    return jsonResponse({ error: 'Listen sind nicht konfiguriert — CLAUDE_API_KEY fehlt' }, 500);
  }

  let list;
  try {
    list = await generateList(request, CLAUDE_API_KEY);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Die Liste konnte nicht erzeugt werden';
    return jsonResponse({ error: message.slice(0, 200) }, 502);
  }
  if (!list.items.length) {
    return jsonResponse({
      error: list.note || 'Daraus konnte ich keine Liste von Orten machen',
    }, 422);
  }

  return jsonResponse(list);
});
