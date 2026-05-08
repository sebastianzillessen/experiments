-- Follow-up to 20260508120000_init.sql, addressing Copilot review feedback on PR #6.
--   1. The invites SELECT policy queried auth.users, but `authenticated` has no
--      SELECT privileges there in stock Supabase. Replace with the JWT email
--      claim and compare case-insensitively (matching the rest of the flow).
--   2. The membership_users view joined auth.users under security_invoker, so
--      `select * from membership_users` failed for normal clients. Replace with
--      a security-definer function that returns rows only when the caller is a
--      member of the household.
--   3. unique (household_id, email) on invites was case-sensitive while the
--      rest of the flow normalises with lower(); enforce uniqueness on
--      lower(email) per household instead.

-- 1. invites SELECT policy --------------------------------------------------

drop policy if exists "user reads own invites" on public.invites;
create policy "user reads own invites" on public.invites for select using (
  lower(email) = lower(auth.jwt() ->> 'email')
  or public.role_in(household_id) in ('owner', 'admin')
);

-- 2. members_of_household RPC replaces membership_users view ----------------

drop view if exists public.membership_users;

create or replace function public.members_of_household(h uuid)
returns table (
  household_id uuid,
  user_id uuid,
  role public.member_role,
  created_at timestamptz,
  email text,
  full_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.household_id,
         m.user_id,
         m.role,
         m.created_at,
         u.email,
         u.raw_user_meta_data ->> 'full_name' as full_name
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.household_id = h
    and public.role_in(h) in ('owner', 'admin');
$$;

-- Functions are EXECUTE-able by PUBLIC by default, so a bare GRANT to
-- `authenticated` would not actually restrict anything. Revoke first, then grant.
revoke all on function public.members_of_household(uuid) from public;
grant execute on function public.members_of_household(uuid) to authenticated;

-- 3. case-insensitive uniqueness for invites --------------------------------

alter table public.invites drop constraint if exists invites_household_id_email_key;
create unique index if not exists invites_household_id_lower_email_idx
  on public.invites (household_id, lower(email));
