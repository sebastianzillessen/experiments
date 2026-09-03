-- Calendar credentials are stored encrypted.
--
-- The key is an Edge Function secret (CALENDAR_ENCRYPTION_KEY), so it sits
-- outside the database. Encrypting happens in `family-calendar-sync`, which is
-- why fp_upsert_calendar goes: while it exists there is a way to write
-- plaintext into the table. Creating and changing a calendar now runs through
-- the function (`{ action: 'save', … }`), with the same role and family check.

drop function if exists public.fp_upsert_calendar(uuid, text, text, text, text, text, boolean, uuid);

comment on table public.fp_calendar_secrets is
  'Calendar address and login as JWE (dir + A256GCM). RLS is on and has no '
  'policy on purpose: only the service-role key of the Edge Function reads '
  'here, and without CALENDAR_ENCRYPTION_KEY the values are useless anyway. '
  'Written only through family-calendar-sync.';
