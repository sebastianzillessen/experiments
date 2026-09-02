-- Fix: fp_create_link_invite would fail on hosted Supabase with
--   "function gen_random_bytes(integer) does not exist".
--
-- 20260901120000_family_planner_init.sql generated the invite token with
-- pgcrypto's gen_random_bytes(). On Supabase pgcrypto lives in the
-- `extensions` schema, but the function runs with `set search_path = public`,
-- so the name cannot be resolved — the same trap Salärli hit and fixed in
-- kinderbetreuung-lohn/supabase/migrations/20260806100000.
--
-- Two v4 UUIDs with the hyphens stripped give 64 URL-safe hex characters
-- (~244 bits of entropy) and gen_random_uuid() is a core function, always
-- resolvable. Only the token line changes; everything else matches the
-- original definition.
create or replace function public.fp_create_link_invite(p_family_id uuid, p_role public.fp_role)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if public.fp_role_in(p_family_id) is distinct from 'owner' then
    raise exception 'Only the family owner can invite' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'Invite role must be editor or viewer';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.fp_invites (family_id, role, token, invited_by)
    values (p_family_id, p_role, v_token, auth.uid());

  return v_token;
end;
$$;

revoke all on function public.fp_create_link_invite(uuid, public.fp_role) from public;
grant execute on function public.fp_create_link_invite(uuid, public.fp_role) to authenticated;
