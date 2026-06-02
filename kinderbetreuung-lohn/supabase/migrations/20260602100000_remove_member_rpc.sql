-- Fix: removing a member reported a false "Keine Zeile gelöscht" error.
--
-- The client removed a member with `from('memberships').delete()…select()`,
-- reading the deleted row back to confirm the delete happened. But PostgREST's
-- DELETE … RETURNING output is filtered by the SELECT RLS policy, and since the
-- memberships-recursion fix that policy only exposes a user's OWN row
-- (user_id = auth.uid()). So when the owner removed someone else, RETURNING came
-- back empty and the client wrongly reported failure — even though the
-- "owners delete memberships" policy had actually deleted the row.
--
-- Replace that fragile path with a security-definer RPC that performs the
-- privileged delete and returns an accurate row count, mirroring the existing
-- members_of_household / accept_invite / create_household_for_self pattern.

create or replace function public.remove_member(p_household_id uuid, p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  -- Only the household owner may remove members.
  if public.role_in(p_household_id) <> 'owner' then
    raise exception 'Only the household owner can remove members'
      using errcode = '42501';
  end if;

  -- An owner cannot remove themselves through this path.
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove yourself'
      using errcode = 'P0001';
  end if;

  -- Never remove an owner row (there is exactly one, the creator).
  delete from public.memberships
  where household_id = p_household_id
    and user_id = p_user_id
    and role <> 'owner';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Functions are EXECUTE-able by PUBLIC by default; revoke first, then grant.
revoke all on function public.remove_member(uuid, uuid) from public;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
