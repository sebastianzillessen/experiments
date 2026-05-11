-- Self-service household creation for users who got past the auth flow
-- without a membership and without a pending invite. The auto-bootstrap
-- trigger in 20260508120000_init.sql only fires on auth.users INSERT, so
-- users that were created before that trigger existed (or whose trigger
-- run failed) end up stuck. This RPC lets them recover without manual SQL.

create or replace function public.create_household_for_self(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_clean_name text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Refuse if the caller already belongs to any household, otherwise the UI
  -- would silently create an orphan that the user can't see.
  if exists (select 1 from public.memberships where user_id = v_user_id) then
    raise exception 'User already belongs to a household';
  end if;

  v_clean_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_clean_name is null then
    raise exception 'Name required';
  end if;

  insert into public.households (name)
    values (v_clean_name)
    returning id into v_household_id;

  insert into public.memberships (household_id, user_id, role)
    values (v_household_id, v_user_id, 'owner');

  insert into public.household_state (household_id)
    values (v_household_id);

  return v_household_id;
end;
$$;

revoke all on function public.create_household_for_self(text) from public;
grant execute on function public.create_household_for_self(text) to authenticated;
