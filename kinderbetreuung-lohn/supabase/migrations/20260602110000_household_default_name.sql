-- New households should not be named after the user's email address.
--
-- handle_new_user() auto-creates a household for a brand-new signup (one with
-- no pending invite). It used to name it "<email> Haushalt", which then showed
-- up in invitation emails. Default to a neutral "Mein Haushalt" instead (or the
-- user's full_name when present); the name is editable in the app afterwards.
--
-- Only the name default changes here; the rest of the function is unchanged.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_pending_invites int;
  v_display_name text;
begin
  select count(*) into v_pending_invites
  from public.invites
  where lower(email) = lower(new.email) and accepted_at is null;

  if v_pending_invites = 0 then
    v_display_name := nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
    insert into public.households (name)
      values (coalesce(v_display_name || ' Haushalt', 'Mein Haushalt'))
      returning id into v_household_id;
    insert into public.memberships (household_id, user_id, role)
      values (v_household_id, new.id, 'owner');
    insert into public.household_profile (household_id) values (v_household_id);
  end if;

  return new;
end;
$$;
