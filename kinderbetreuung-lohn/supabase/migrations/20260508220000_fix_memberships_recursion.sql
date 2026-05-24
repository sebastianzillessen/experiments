-- Replace the self-referential SELECT policy on public.memberships.
--
-- The original policy:
--
--   household_id in (
--     select household_id from public.memberships where user_id = auth.uid()
--   )
--
-- queries memberships from inside the policy on memberships. PostgreSQL guards
-- against infinite recursion by terminating the inner evaluation early, which
-- in this shape often returns an empty set -- so even a perfectly valid
-- auth.uid() and existing membership row produces zero visible rows. The
-- client's fetchMembership() then thinks the user has no household and routes
-- them to the create-household screen, which fails on the unique constraint.
--
-- A user only ever needs to see their own membership rows from the client
-- (fetchMembership filters on user_id = auth.uid() anyway). The members list
-- goes through the security-definer RPC `members_of_household`, so it doesn't
-- depend on this policy. Restrict the policy to the simplest correct rule.

drop policy if exists "members read memberships" on public.memberships;

create policy "members read own memberships" on public.memberships for select
  using (user_id = auth.uid());
