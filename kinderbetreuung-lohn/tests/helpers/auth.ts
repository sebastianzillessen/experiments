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
// Inbucket's default mailbox-naming mode is "local" — the mailbox name is the
// local-part of the recipient email (everything before @).
export async function magicLinkFromInbucket(email: string, timeoutMs = 15_000): Promise<string> {
  const base = getStackInfo().inbucketUrl;
  const mailbox = encodeURIComponent(email.split('@')[0]);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const listResp = await fetch(`${base}/api/v1/mailbox/${mailbox}`);
      if (listResp.ok) {
        const list = await listResp.json() as Array<{ id: string }>;
        if (list.length > 0) {
          const latest = list[list.length - 1];
          const msgResp = await fetch(`${base}/api/v1/mailbox/${mailbox}/${latest.id}`);
          if (msgResp.ok) {
            const msg = await msgResp.json() as { body?: { html?: string; text?: string } };
            const content = msg.body?.html ?? msg.body?.text ?? '';
            const match = content.match(/https?:\/\/[^\s"<>]+/);
            if (match) return match[0];
          }
        }
      }
    } catch {
      // transient — keep polling
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`No Inbucket mail for ${email} within ${timeoutMs}ms`);
}
