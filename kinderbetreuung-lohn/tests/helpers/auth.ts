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

// Full path: poll Inbucket for the actual mail Supabase sent after signInWithOtp.
// Used by the auth smoke test to validate the mail template / redirect end-to-end.
//
// Inbucket's mailbox-naming mode is configurable (MP_MAILBOX_NAMING):
//   - "local" → mailbox = local-part of email (default)
//   - "full"  → mailbox = full email address
// We don't control the Supabase-bundled Inbucket config across versions, so we
// try every reasonable candidate name.
export async function magicLinkFromInbucket(email: string, timeoutMs = 20_000): Promise<string> {
  const base = getStackInfo().inbucketUrl;
  const localPart = email.split('@')[0];
  const candidates = Array.from(new Set([
    localPart,
    email,
    localPart.split('-')[0]   // in case subaddress stripping is enabled
  ])).map(encodeURIComponent);

  const apiBases = [`${base}/api/v1`, `${base}/api/v2`];

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const apiBase of apiBases) {
      for (const name of candidates) {
        try {
          const listResp = await fetch(`${apiBase}/mailbox/${name}`);
          if (!listResp.ok) continue;
          const list = await listResp.json() as Array<{ id: string; to?: string[] }>;
          if (!Array.isArray(list) || list.length === 0) continue;
          const mine = list.filter(m => !m.to || m.to.some(addr => addr.toLowerCase().includes(email.toLowerCase())));
          const target = mine.length > 0 ? mine[mine.length - 1] : list[list.length - 1];
          const msgResp = await fetch(`${apiBase}/mailbox/${name}/${target.id}`);
          if (!msgResp.ok) continue;
          const msg = await msgResp.json() as { body?: { html?: string; text?: string } };
          const content = msg.body?.html ?? msg.body?.text ?? '';
          const match = content.match(/https?:\/\/[^\s"<>]+/);
          if (match) return match[0];
        } catch {
          // transient — keep polling
        }
      }
    }
    await new Promise(r => setTimeout(r, 250));
  }

  // Diagnostic dump — what does Inbucket actually have?
  const diag: string[] = [];
  for (const apiBase of apiBases) {
    for (const name of candidates) {
      try {
        const r = await fetch(`${apiBase}/mailbox/${name}`);
        diag.push(`GET ${apiBase}/mailbox/${decodeURIComponent(name)} → ${r.status} body=${(await r.text()).slice(0, 200)}`);
      } catch (e) { diag.push(`GET ${apiBase}/mailbox/${decodeURIComponent(name)} threw ${String(e)}`); }
    }
  }
  try {
    const root = await fetch(base);
    diag.push(`GET ${base}/ → ${root.status} ct=${root.headers.get('content-type')}`);
  } catch (e) { diag.push(`GET ${base}/ threw ${String(e)}`); }

  throw new Error(`No Inbucket mail for ${email} within ${timeoutMs}ms (base=${base}).\n${diag.join('\n')}`);
}
