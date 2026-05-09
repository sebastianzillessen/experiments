// Supabase Edge Function: send-invite-email
//
// Triggered by the kinderbetreuung-lohn frontend right after an `invites` row
// is inserted. It generates a magic-link for the invitee (creating the auth
// user if they don't exist yet), then sends a German invitation email via
// Resend.
//
// Required env / Supabase secrets:
//   - RESEND_API_KEY       (required) Resend API key
//   - INVITE_EMAIL_FROM    (recommended) sender, e.g.
//                          'Lohnabrechnung Kinderbetreuung <noreply@zillessen.dev>'
//   - APP_URL              (optional)  defaults to the production URL
//
// The function expects a POST with JSON body { "invite_id": "<uuid>" }.
// Auth: standard Supabase JWT verification is enabled (default).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://zillessen.dev/kinderbetreuung-lohn/';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const INVITE_EMAIL_FROM =
  Deno.env.get('INVITE_EMAIL_FROM') ??
  'Lohnabrechnung Kinderbetreuung <onboarding@resend.dev>';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]!),
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!RESEND_API_KEY) {
    return jsonResponse(
      { error: 'RESEND_API_KEY not configured on the function' },
      500,
    );
  }

  let body: { invite_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const inviteId = body.invite_id;
  if (!inviteId) {
    return jsonResponse({ error: 'invite_id is required' }, 400);
  }

  // Auth check: forward caller's JWT so RLS applies when reading the invite.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify the JWT actually identifies a user.
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // RLS-respecting fetch — caller can only see invites for households they
  // belong to (per the existing "user reads own invites" policy).
  const { data: invite, error: inviteErr } = await userClient
    .from('invites')
    .select('id, email, role, household_id, accepted_at, households(name)')
    .eq('id', inviteId)
    .maybeSingle();

  if (inviteErr) {
    return jsonResponse(
      { error: 'Failed to read invite: ' + inviteErr.message },
      500,
    );
  }
  if (!invite) {
    return jsonResponse({ error: 'Invite not found or no access' }, 404);
  }
  if (invite.accepted_at) {
    return jsonResponse({ error: 'Invite already accepted' }, 409);
  }

  const householdName =
    (invite as any).households?.name ?? 'einem Haushalt';

  // Service-role client for admin auth operations.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Ensure the user exists; createUser is idempotent-by-error: it returns
  //    an "already registered" error which we treat as success.
  const { error: createErr } = await adminClient.auth.admin.createUser({
    email: invite.email,
    email_confirm: true,
  });
  if (createErr) {
    const msg = (createErr.message || '').toLowerCase();
    const alreadyExists =
      msg.includes('already') || msg.includes('registered') || msg.includes('exists');
    if (!alreadyExists) {
      return jsonResponse(
        { error: 'Failed to create auth user: ' + createErr.message },
        500,
      );
    }
  }

  // 2. Generate a magic link that lands the invitee on the app already
  //    signed-in. Their existing onAuthStateChange + fetchPendingInvite flow
  //    then renders the "Einladung annehmen" banner.
  const { data: linkData, error: linkErr } =
    await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: invite.email,
      options: { redirectTo: APP_URL },
    });

  if (linkErr || !linkData) {
    return jsonResponse(
      { error: 'Failed to generate magic link: ' + (linkErr?.message ?? 'unknown') },
      500,
    );
  }

  const actionLink =
    (linkData as any)?.properties?.action_link ?? (linkData as any)?.action_link;
  if (!actionLink) {
    return jsonResponse({ error: 'generateLink returned no action_link' }, 500);
  }

  // 3. Send the email via Resend.
  const subject = `Einladung zu „${householdName}" — Lohnabrechnung Kinderbetreuung`;
  const html = `<!doctype html>
<html lang="de"><body style="margin:0; padding:0; background:#f5f7fa; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; color:#1f2933;">
  <div style="max-width:560px; margin:0 auto; padding:32px 24px;">
    <h1 style="font-size:22px; color:#1a3a5c; margin:0 0 16px;">Einladung zu „${escapeHtml(householdName)}"</h1>
    <p style="font-size:15px; line-height:1.5; margin:0 0 14px;">Hallo,</p>
    <p style="font-size:15px; line-height:1.5; margin:0 0 14px;">
      du wurdest in den Haushalt <strong>${escapeHtml(householdName)}</strong>
      als <strong>${escapeHtml(invite.role)}</strong> in <em>Lohnabrechnung Kinderbetreuung</em> eingeladen.
    </p>
    <p style="font-size:15px; line-height:1.5; margin:0 0 24px;">
      Klick den Button — du wirst automatisch angemeldet und kannst die Einladung im Tool annehmen.
    </p>
    <p style="margin:0 0 28px;">
      <a href="${actionLink}" style="display:inline-block; background:#2e6ea6; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:600; font-size:15px;">
        Anmelden &amp; Einladung annehmen
      </a>
    </p>
    <p style="font-size:12px; color:#6b7480; line-height:1.5; margin:0 0 6px;">
      Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
    </p>
    <p style="font-size:12px; color:#2e6ea6; word-break:break-all; margin:0 0 24px;">
      <a href="${actionLink}" style="color:#2e6ea6;">${escapeHtml(actionLink)}</a>
    </p>
    <hr style="border:none; border-top:1px solid #e1e6eb; margin:24px 0;">
    <p style="font-size:11px; color:#6b7480; line-height:1.5; margin:0;">
      Diese Einladung wurde automatisch versandt, weil dich jemand zu einem Haushalt in <em>Lohnabrechnung Kinderbetreuung</em> hinzugefügt hat. Wenn du die Einladung nicht erwartet hast, kannst du diese E-Mail ignorieren.
    </p>
  </div>
</body></html>`;

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: INVITE_EMAIL_FROM,
      to: invite.email,
      subject,
      html,
    }),
  });

  if (!resendResp.ok) {
    const text = await resendResp.text();
    return jsonResponse(
      { error: 'Resend send failed', status: resendResp.status, body: text },
      502,
    );
  }

  const resendData = await resendResp.json().catch(() => ({}));
  return jsonResponse({ ok: true, resend_id: resendData.id ?? null });
});
