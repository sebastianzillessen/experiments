-- Fix: create_link_invite failed on hosted Supabase with
--   "function gen_random_bytes(integer) does not exist".
--
-- 20260805120000_link_invites.sql generated the token with pgcrypto's
-- gen_random_bytes(). On Supabase pgcrypto is installed in the `extensions`
-- schema, but the function runs with `set search_path = public`, so the name
-- can't be resolved. (It only worked in local/dev where pgcrypto happened to be
-- in public.)
--
-- Switch to gen_random_uuid(), a core function that is always resolvable
-- regardless of search_path (it's what the rest of the schema already uses for
-- default ids). Two v4 UUIDs, hyphens stripped, give 64 URL-safe hex chars
-- (~244 bits of entropy) — no extension dependency. Only the token-generation
-- line changes; everything else matches the original definition.
create or replace function public.create_link_invite(
  p_role public.member_role,
  p_employee_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_token text;
begin
  select household_id into v_household_id
  from public.memberships
  where user_id = auth.uid() and role in ('owner', 'admin')
  limit 1;

  if v_household_id is null then
    raise exception 'Only an owner or admin can create invite links'
      using errcode = '42501';
  end if;

  if p_role not in ('admin', 'employee') then
    raise exception 'Invite role must be admin or employee'
      using errcode = 'P0001';
  end if;

  if p_employee_id is not null
     and public.employee_household(p_employee_id) is distinct from v_household_id then
    raise exception 'Employee does not belong to this household'
      using errcode = 'P0001';
  end if;

  -- 64 URL-safe hex chars from two v4 UUIDs; gen_random_uuid() is a core
  -- function, so no pgcrypto / extensions-schema dependency.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.invites (household_id, email, role, invited_by, employee_id, token)
    values (v_household_id, null, p_role, auth.uid(), p_employee_id, v_token);

  return v_token;
end;
$$;
