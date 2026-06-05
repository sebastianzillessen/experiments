# `send-invite-email` Edge Function

Sends a German invitation email with a one-click magic link when a row is inserted into `public.invites`. Called from the kinderbetreuung-lohn frontend after a successful insert.

## Flow

1. Inviter clicks **Einladen** → frontend inserts into `public.invites` and gets back the new `id`.
2. Frontend calls `supabase.functions.invoke('send-invite-email', { body: { invite_id } })`.
3. Function verifies caller's JWT, reads invite via RLS, then with the service role key:
   - Calls `auth.admin.createUser({ email, email_confirm: true })` — idempotent (silently OK if user already exists).
   - Calls `auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: APP_URL } })` to get an `action_link`.
4. Function `POST`s a custom HTML email containing that link to Resend's `/emails` endpoint.
5. Recipient clicks the link → auto-signed-in → existing `fetchPendingInvite` shows the "Einladung annehmen" banner.

## One-time setup

You need a Resend account and a verified sender domain.

1. **Resend account**: <https://resend.com> → API Keys → create one (e.g. `re_xxx`).
2. **Verify sender domain**: Resend → Domains → add `zillessen.dev` (or any domain you control), copy the SPF / DKIM / DMARC records into your DNS provider, wait for verification.
3. **Set the Supabase function secret** (one time, from a machine with the Supabase CLI):
   ```bash
   supabase login   # opens browser
   supabase secrets set RESEND_API_KEY=re_xxx --project-ref tbknudbcgaarqixweizj
   ```
   Or set it in the dashboard: Project → Settings → Edge Functions → Secrets.

   The sender (`INVITE_EMAIL_FROM`) and magic-link target (`APP_URL`) are **code
   constants** at the top of `index.ts` — change them there and redeploy, not via
   secrets. (Any leftover `INVITE_EMAIL_FROM` / `APP_URL` secret is ignored and can
   be removed with `supabase secrets unset INVITE_EMAIL_FROM APP_URL`.)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are auto-provided by the runtime — don't set them yourself.

## Deployment

Pushing to `main` triggers `.github/workflows/supabase-functions.yml`, which runs `supabase functions deploy send-invite-email`. No manual step needed once the `RESEND_API_KEY` secret is set.

## Troubleshooting

- **400 "RESEND_API_KEY not configured"** — secret missing. Re-run `supabase secrets set ...`.
- **502 "Resend send failed" with `validation_error`** — the `INVITE_EMAIL_FROM` constant's domain isn't verified in Resend. (`onboarding@resend.dev` is Resend's sandbox and only delivers to addresses on your own Resend account.)
- **404 "Invite not found or no access"** — the caller's JWT doesn't include them in the household. RLS rejected the read.
- **Magic link goes to wrong origin** — update the `APP_URL` constant in `index.ts` AND make sure the URL is in Supabase Auth → URL Configuration → Redirect URLs.

## Local invocation

```bash
supabase functions serve send-invite-email --env-file .env.local
curl -i -X POST http://localhost:54321/functions/v1/send-invite-email \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"invite_id":"<uuid>"}'
```
