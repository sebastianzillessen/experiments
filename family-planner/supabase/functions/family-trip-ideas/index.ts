// Supabase Edge Function: family-trip-ideas
//
// Trip suggestions for one canton, for a family working through all 26.
//
//   POST { family_id: uuid, canton: "GR", wishes?: string, refresh?: boolean }
//   → { ideas: [{ id, title, summary, highlights, duration, season, travel }],
//       cached: boolean, generated_at: string }
//
// Cached per canton: asking twice for the same canton costs money and returns
// much the same thing, so the stored batch is handed back unless `refresh` is
// set or the wishes have changed. The family's postal code (the one the
// weather already uses) goes in as the starting point when it is set.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY come
// from the runtime; CLAUDE_API_KEY is set with `supabase secrets set`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';
import { suggestTrips } from './suggest.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') ?? null;

// The 26 codes and their German names. Duplicated from src/lib/cantons.ts
// because an Edge Function cannot import from the app — the test suite checks
// the two against each other, and against the check constraint.
const CANTONS: Record<string, string> = {
  AG: 'Aargau', AR: 'Appenzell Ausserrhoden', AI: 'Appenzell Innerrhoden',
  BL: 'Basel-Landschaft', BS: 'Basel-Stadt', BE: 'Bern', FR: 'Freiburg',
  GE: 'Genf', GL: 'Glarus', GR: 'Graubünden', JU: 'Jura', LU: 'Luzern',
  NE: 'Neuenburg', NW: 'Nidwalden', OW: 'Obwalden', SG: 'St. Gallen',
  SH: 'Schaffhausen', SZ: 'Schwyz', SO: 'Solothurn', TI: 'Tessin',
  TG: 'Thurgau', UR: 'Uri', VD: 'Waadt', VS: 'Wallis', ZG: 'Zug', ZH: 'Zürich',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: { family_id?: string; canton?: string; wishes?: string; refresh?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const familyId = body.family_id;
  const canton = (body.canton ?? '').toUpperCase();
  if (!familyId) return jsonResponse({ error: 'family_id required' }, 400);
  if (!CANTONS[canton]) return jsonResponse({ error: 'Diesen Kanton gibt es nicht' }, 400);
  const wishes = (body.wishes ?? '').trim().slice(0, 400);

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Asking costs money, so this is for people who may change the plan.
  const { data: membership } = await admin
    .from('fp_memberships')
    .select('role')
    .eq('family_id', familyId)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (!membership) return jsonResponse({ error: 'Forbidden' }, 403);
  if (membership.role !== 'owner' && membership.role !== 'editor') {
    return jsonResponse({ error: 'Nur Owner und Bearbeiter dürfen Ideen holen' }, 403);
  }

  const { data: cached } = await admin
    .from('fp_trip_ideas')
    .select('id, title, summary, highlights, duration, season, travel, wishes, generated_at')
    .eq('family_id', familyId)
    .eq('canton', canton)
    .order('generated_at');

  // Same canton, same wishes, nothing newer asked for: hand back what is
  // already paid for.
  if (!body.refresh && cached?.length && (cached[0].wishes ?? '') === wishes) {
    return jsonResponse({
      ideas: cached,
      cached: true,
      generated_at: cached[0].generated_at,
    });
  }

  // Only past the membership check: how this function is configured is nobody
  // else's business, and the anon key is public.
  if (!CLAUDE_API_KEY) {
    return jsonResponse({ error: 'Ideen sind nicht konfiguriert — CLAUDE_API_KEY fehlt' }, 500);
  }

  const { data: family } = await admin
    .from('fp_families').select('weather_plz').eq('id', familyId).maybeSingle();

  let ideas;
  try {
    ideas = await suggestTrips(CANTONS[canton], wishes, family?.weather_plz ?? null, CLAUDE_API_KEY);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Die Ideen konnten nicht geholt werden';
    return jsonResponse({ error: message.slice(0, 200) }, 502);
  }
  if (!ideas.length) {
    return jsonResponse({ error: 'Für diesen Kanton kamen keine brauchbaren Vorschläge zurück' }, 502);
  }

  // A batch replaces the one before it: these are proposals, not records, and
  // half-old suggestions beside new ones would only be confusing.
  const generatedAt = new Date().toISOString();
  await admin.from('fp_trip_ideas').delete().eq('family_id', familyId).eq('canton', canton);
  const { data: stored, error: storeErr } = await admin.from('fp_trip_ideas').insert(
    ideas.map(idea => ({ ...idea, family_id: familyId, canton, wishes, generated_at: generatedAt }))
  ).select('id, title, summary, highlights, duration, season, travel');
  if (storeErr || !stored) {
    return jsonResponse({ error: 'Die Ideen konnten nicht gespeichert werden' }, 500);
  }

  return jsonResponse({ ideas: stored, cached: false, generated_at: generatedAt });
});
