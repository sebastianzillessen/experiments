import { adminClient, getStackInfo } from './supabase';

export type CreatedUser = { id: string; email: string };

export async function createConfirmedUser(email: string): Promise<CreatedUser> {
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    email_confirm: true
  });
  if (error) throw error;
  return { id: data.user!.id, email: data.user!.email! };
}

// Fast path: generate the magic-link via the admin API and return the action_link
// directly. Skips SMTP entirely while still exercising the client-side token exchange.
export async function magicLinkFor(email: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email
  });
  if (error) throw error;
  if (!data.properties?.action_link) {
    throw new Error(`generateLink returned no action_link for ${email}`);
  }
  return data.properties.action_link;
}

// Full path: poll the Supabase local-stack mailcatcher for the actual mail sent
// after signInWithOtp. Validates the mail template / redirect end-to-end.
//
// Supabase historically bundled Inbucket but recent CLI versions ship Mailpit
// instead — both on port 54324. The two have different APIs:
//   Mailpit:  GET /api/v1/messages              → { messages: [{ ID, To, ... }] }
//             GET /api/v1/message/{id}          → { HTML, Text, To, ... }
//   Inbucket: GET /api/v1/mailbox/{local-part}  → [{ id, to, ... }]
//             GET /api/v1/mailbox/{local-part}/{id} → { body: { html, text }, ... }
export async function magicLinkFromInbucket(email: string, timeoutMs = 20_000): Promise<string> {
  const base = getStackInfo().inbucketUrl;
  const deadline = Date.now() + timeoutMs;
  const errors: string[] = [];

  while (Date.now() < deadline) {
    try {
      const link = await tryMailpit(base, email);
      if (link) return link;
    } catch (e) { errors.push(`mailpit: ${String(e)}`); }
    try {
      const link = await tryInbucket(base, email);
      if (link) return link;
    } catch (e) { errors.push(`inbucket: ${String(e)}`); }
    await new Promise(r => setTimeout(r, 250));
  }

  throw new Error(`No mail for ${email} within ${timeoutMs}ms at ${base}. Errors: ${errors.slice(-4).join(' | ')}`);
}

async function tryMailpit(base: string, email: string): Promise<string | null> {
  const resp = await fetch(`${base}/api/v1/messages?limit=50`);
  if (!resp.ok) return null;
  const body = await resp.json() as { messages?: Array<{ ID: string; To?: Array<{ Address?: string }> }> };
  if (!body.messages) return null;
  const target = body.messages.find(m =>
    (m.To ?? []).some(t => (t.Address ?? '').toLowerCase() === email.toLowerCase())
  );
  if (!target) return null;
  const detailResp = await fetch(`${base}/api/v1/message/${target.ID}`);
  if (!detailResp.ok) return null;
  const detail = await detailResp.json() as { HTML?: string; Text?: string };
  const content = detail.HTML ?? detail.Text ?? '';
  const match = content.match(/https?:\/\/[^\s"<>]+/);
  return match ? match[0] : null;
}

async function tryInbucket(base: string, email: string): Promise<string | null> {
  const candidates = Array.from(new Set([
    email.split('@')[0],
    email,
    email.split('@')[0].split('-')[0]
  ])).map(encodeURIComponent);

  for (const name of candidates) {
    const listResp = await fetch(`${base}/api/v1/mailbox/${name}`);
    if (!listResp.ok) continue;
    const list = await listResp.json() as Array<{ id: string }>;
    if (!Array.isArray(list) || list.length === 0) continue;
    const target = list[list.length - 1];
    const msgResp = await fetch(`${base}/api/v1/mailbox/${name}/${target.id}`);
    if (!msgResp.ok) continue;
    const msg = await msgResp.json() as { body?: { html?: string; text?: string } };
    const content = msg.body?.html ?? msg.body?.text ?? '';
    const match = content.match(/https?:\/\/[^\s"<>]+/);
    if (match) return match[0];
  }
  return null;
}
