-- URL / link invitations: invite someone into a household without knowing their
-- email address. The owner/admin creates an invite that carries a secret random
-- token instead of an email; the resulting link (…?invite=<token>) is shared out
-- of band (WhatsApp, chat, …). Whoever opens it registers a brand-new account
-- and is joined to the household automatically.
--
-- How the token is consumed:
--   1. Primary, race-free path — the frontend passes the token as signup user
--      metadata (raw_user_meta_data.invite_token). handle_new_user() reads it and
--      creates the membership synchronously at user creation, so the new user gets
--      NO auto-created own household and lands directly in the invited household.
--   2. Fallback — accept_invite_by_token(), called by the client after sign-in for
--      users the trigger could not cover. Idempotent: a token already accepted in
--      (1) simply returns null.
--
-- Email invites (20260508120000_init.sql) keep working unchanged; the two invite
-- kinds live side by side in the same table (email XOR token).

-- =========================================================================
-- 1. SCHEMA: token column, nullable email, email-XOR-token invariant
-- =========================================================================

-- Link invites have no email — only a token. Email invites have no token.
alter table public.invites alter column email drop not null;

alter table public.invites add column if not exists token text;

create unique index if not exists invites_token_uidx
  on public.invites (token) where token is not null;

-- Every invite must be reachable one way or the other.
alter table public.invites drop constraint if exists invites_email_or_token_chk;
alter table public.invites add constraint invites_email_or_token_chk
  check (email is not null or token is not null);

-- =========================================================================
-- 2. create_link_invite: owner/admin mints a link invite, returns its token
-- =========================================================================

-- Security definer so the token is generated server-side (never trusted from the
-- client). Still enforces the owner/admin check the RLS insert policy would.
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
  -- Derive the target household from the caller's owner/admin membership. A user
  -- belongs to at most one household in this app, so this is unambiguous.
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

  -- An employee link, when given, must belong to this household.
  if p_employee_id is not null
     and public.employee_household(p_employee_id) is distinct from v_household_id then
    raise exception 'Employee does not belong to this household'
      using errcode = 'P0001';
  end if;

  -- 24 random bytes → URL-safe base64 (no +, /, or = so it survives a query string).
  v_token := replace(replace(replace(
    encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '');

  insert into public.invites (household_id, email, role, invited_by, employee_id, token)
    values (v_household_id, null, p_role, auth.uid(), p_employee_id, v_token);

  return v_token;
end;
$$;

revoke all on function public.create_link_invite(public.member_role, uuid) from public;
grant execute on function public.create_link_invite(public.member_role, uuid) to authenticated;

-- =========================================================================
-- 3. invite_info: resolve a token to a household name for the landing page
-- =========================================================================

-- Callable before authentication so the login screen can greet the invitee with
-- the household they are joining. Only ever exposes the name of a household for
-- which the caller already holds the secret token, and nothing for an accepted
-- or unknown token.
create or replace function public.invite_info(p_token text)
returns table (household_name text, role public.member_role)
language sql
stable
security definer
set search_path = public
as $$
  select h.name, i.role
  from public.invites i
  join public.households h on h.id = i.household_id
  where i.token = p_token
    and i.token is not null
    and i.accepted_at is null
$$;

revoke all on function public.invite_info(text) from public;
grant execute on function public.invite_info(text) to anon, authenticated;

-- =========================================================================
-- 4. accept_invite_by_token: client-side fallback for the signed-in user
-- =========================================================================

-- Mirrors accept_invite() but matches on the secret token instead of the email,
-- so it works for a user whose email was unknown when the invite was made.
-- Returns the joined household id, or null when the token is unknown/already used
-- (e.g. handle_new_user already consumed it at signup).
create or replace function public.accept_invite_by_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from public.invites
  where token = p_token and token is not null and accepted_at is null
  limit 1;

  if v_invite.id is null then
    return null;
  end if;

  insert into public.memberships (household_id, user_id, role)
    values (v_invite.household_id, auth.uid(), v_invite.role)
    on conflict (household_id, user_id) do update set role = excluded.role;

  -- Optional employee link (same semantics as accept_invite): only fill an
  -- as-yet unlinked record in the same household.
  if v_invite.employee_id is not null then
    update public.employees
      set user_id = auth.uid()
      where id = v_invite.employee_id
        and household_id = v_invite.household_id
        and user_id is null;
  end if;

  update public.invites set accepted_at = now() where id = v_invite.id;
  return v_invite.household_id;
end;
$$;

revoke all on function public.accept_invite_by_token(text) from public;
grant execute on function public.accept_invite_by_token(text) to authenticated;

-- =========================================================================
-- 5. handle_new_user: consume a link-invite token carried in signup metadata
-- =========================================================================

-- Extends the auto-owner-household trigger: when the signup carries a valid
-- invite_token, join that household (as the invite's role, optionally linking an
-- employee record) and skip the own-household creation entirely. Without a token
-- the behaviour is exactly as before (household_default_name migration).
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
  v_token text;
  v_invite public.invites%rowtype;
begin
  v_token := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'invite_token', '')), '');
  if v_token is not null then
    select * into v_invite
    from public.invites
    where token = v_token and token is not null and accepted_at is null
    limit 1;

    if v_invite.id is not null then
      insert into public.memberships (household_id, user_id, role)
        values (v_invite.household_id, new.id, v_invite.role)
        on conflict (household_id, user_id) do update set role = excluded.role;

      if v_invite.employee_id is not null then
        update public.employees
          set user_id = new.id
          where id = v_invite.employee_id
            and household_id = v_invite.household_id
            and user_id is null;
      end if;

      update public.invites set accepted_at = now() where id = v_invite.id;
      return new;  -- joined the invited household; no own household
    end if;
  end if;

  select count(*) into v_pending_invites
  from public.invites
  where lower(email) = lower(new.email) and accepted_at is null;

  if v_pending_invites = 0 then
    v_display_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
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
