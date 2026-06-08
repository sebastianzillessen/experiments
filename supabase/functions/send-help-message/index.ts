// Supabase Edge Function: send-help-message
//
// Triggered by the kinderbetreuung-lohn frontend's in-app help assistant. It
// takes a signed-in user's question/message and emails it to the support
// contact via Resend, with the user's address as reply-to so support can answer
// directly.
//
// This is intentionally a thin "fire it off as an email" step for now. Later an
// agent could answer some questions automatically: the function can grow a
// `reply` field in its JSON response (the frontend already renders one) and/or
// route the message to an LLM before/instead of emailing a human.
//
// Required secret:
//   - RESEND_API_KEY       (required) Resend API key
// The recipient (SUPPORT_EMAIL), sender (HELP_EMAIL_FROM) and app URL are
// code-defined constants below — edit them here and redeploy (same convention
// as send-invite-email), so a stale Supabase secret can't override them.
//
// Expected POST body: JSON
//   { "message": "<text>", "context"?: { tab?, householdName?, role?, url? } }
// Auth: standard Supabase JWT verification is enabled (default).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';

// Where help requests land. A recipient address does NOT need to be on the
// Resend-verified domain — only the sender does.
const SUPPORT_EMAIL = 'salaerli@zillessen.info';
// Sender: the address domain must stay verified in Resend (zillessen.dev).
const HELP_EMAIL_FROM = 'Salärli <noreply@zillessen.dev>';
const APP_URL = 'https://salaerli.zillessen.dev/';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

const MAX_MESSAGE_LEN = 5000;

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  employee: 'Mitarbeitende/r',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
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

  let body: { message?: string; context?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const message = (body.message ?? '').toString().trim();
  if (!message) {
    return jsonResponse({ error: 'message is required' }, 400);
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return jsonResponse(
      { error: `message too long (max ${MAX_MESSAGE_LEN} characters)` },
      400,
    );
  }

  // Auth check: forward the caller's JWT and confirm it identifies a user.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const ctx = (body.context ?? {}) as Record<string, unknown>;
  const tab = ctx.tab ? String(ctx.tab) : '';
  const householdName = ctx.householdName ? String(ctx.householdName) : '';
  const role = ctx.role ? ROLE_LABELS[String(ctx.role)] ?? String(ctx.role) : '';
  const fromUrl = ctx.url ? String(ctx.url) : APP_URL;
  const userEmail = user.email ?? '(keine E-Mail im Konto)';

  const metaRows = [
    ['Von', userEmail],
    ['Haushalt', householdName],
    ['Rolle', role],
    ['Bereich', tab],
    ['Seite', fromUrl],
    ['Zeitpunkt', new Date().toISOString()],
  ].filter(([, v]) => v);

  const subject = `Hilfe-Anfrage — Salärli${householdName ? ` (${householdName})` : ''}`;
  const html = `<!doctype html>
<html lang="de"><body style="margin:0; padding:0; background:#f5f7fa; font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; color:#1f2933;">
  <div style="max-width:560px; margin:0 auto; padding:32px 24px;">
    <h1 style="font-size:20px; color:#1a3a5c; margin:0 0 16px;">Neue Hilfe-Anfrage</h1>
    <div style="background:#fff; border:1px solid #e1e6eb; border-radius:8px; padding:16px; font-size:15px; line-height:1.5; white-space:pre-wrap; margin:0 0 20px;">${escapeHtml(message)}</div>
    <table style="font-size:13px; color:#6b7480; border-collapse:collapse;">
      ${metaRows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:2px 12px 2px 0; vertical-align:top;"><strong>${escapeHtml(k)}</strong></td><td style="padding:2px 0;">${escapeHtml(v)}</td></tr>`,
        )
        .join('')}
    </table>
    <hr style="border:none; border-top:1px solid #e1e6eb; margin:24px 0;">
    <p style="font-size:11px; color:#6b7480; line-height:1.5; margin:0;">
      Diese Nachricht wurde über den Hilfe-Assistenten in <em>Salärli</em> gesendet. Antworte einfach auf diese E-Mail, um ${escapeHtml(userEmail)} direkt zu erreichen.
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
      from: HELP_EMAIL_FROM,
      to: SUPPORT_EMAIL,
      reply_to: user.email ? [user.email] : undefined,
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
  // `reply` is null for now; a future agent can return an answer here and the
  // frontend will display it inline.
  return jsonResponse({ ok: true, reply: null, resend_id: resendData.id ?? null });
});
