# `send-help-message` Edge Function

Emails an in-app help request from the kinderbetreuung-lohn help assistant to the
support contact via Resend. The signed-in user's address is set as `reply_to` so
support can answer them directly.

## Flow

1. A signed-in user opens the help assistant (the **Hilfe** launcher) and writes a message.
2. Frontend calls `supabase.functions.invoke('send-help-message', { body: { message, context } })`.
   `context` carries lightweight diagnostics: `{ tab, householdName, role, url }`.
3. Function verifies the caller's JWT, then `POST`s a German HTML email to
   `SUPPORT_EMAIL` via Resend with `reply_to` = the user's email.
4. Returns `{ ok: true, reply: null }`.

`reply` is always `null` today. It is the seam for a future agent: the function
can return an answer string there and the frontend renders it inline (see
`HelpAssistant.tsx`).

## Configuration

These are **code constants** at the top of `index.ts` — change them there and
redeploy (not via secrets):

- `SUPPORT_EMAIL` — recipient of help requests (`salaerli@zillessen.info`). A
  recipient does **not** need to be on the Resend-verified domain.
- `HELP_EMAIL_FROM` — sender; its domain must stay verified in Resend (`zillessen.dev`).
- `APP_URL` — used as a fallback "page" link in the email.

Required secret (shared with `send-invite-email`, already set on the project):

```bash
supabase secrets set RESEND_API_KEY=re_xxx --project-ref tbknudbcgaarqixweizj
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are auto-provided by the runtime.

## Deployment

Pushing to `main` triggers `.github/workflows/supabase-functions.yml`, which
deploys every function under `supabase/functions/` — including this one. No
manual step once `RESEND_API_KEY` is set.

## Troubleshooting

- **500 "RESEND_API_KEY not configured"** — secret missing; re-run `supabase secrets set ...`.
- **502 "Resend send failed" with `validation_error`** — `HELP_EMAIL_FROM`'s domain isn't verified in Resend.
- **401 "Unauthorized"** — the caller isn't signed in (no valid JWT).

## Local invocation

```bash
supabase functions serve send-help-message --env-file .env.local
curl -i -X POST http://localhost:54321/functions/v1/send-help-message \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Wie lege ich einen Stundenlohn an?","context":{"tab":"mitarbeitende"}}'
```
