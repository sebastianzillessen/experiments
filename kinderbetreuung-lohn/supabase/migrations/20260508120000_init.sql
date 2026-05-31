-- Multi-User-Setup für das Lohn-Tool: Haushalt + Rollen + E-Mail-Einladungen.
-- Im Supabase SQL Editor ausführen.

-- =========================================================================
-- TABLES
-- =========================================================================

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.household_state (
  household_id uuid primary key references public.households(id) on delete cascade,
  arbeitgeber jsonb not null default '{}'::jsonb,
  arbeitnehmer jsonb not null default '{}'::jsonb,
  einstellungen jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

do $$ begin
  create type public.member_role as enum ('owner', 'admin', 'employee');
exception when duplicate_object then null; end $$;

create table if not exists public.memberships (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.einsaetze (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  datum date not null,
  stunden numeric(6,2) not null check (stunden > 0),
  notiz text not null default '',
  entered_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists einsaetze_household_datum_idx
  on public.einsaetze (household_id, datum);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  role public.member_role not null,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (household_id, email)
);

-- =========================================================================
-- HELPER FUNCTION
-- =========================================================================

create or replace function public.role_in(h uuid)
returns public.member_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.memberships
  where household_id = h and user_id = auth.uid()
$$;

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

alter table public.households       enable row level security;
alter table public.household_state  enable row level security;
alter table public.memberships      enable row level security;
alter table public.einsaetze        enable row level security;
alter table public.invites          enable row level security;

-- households
drop policy if exists "members read household" on public.households;
create policy "members read household" on public.households for select
  using (public.role_in(id) is not null);

drop policy if exists "admins update household" on public.households;
create policy "admins update household" on public.households for update
  using (public.role_in(id) in ('owner','admin'));

-- household_state
drop policy if exists "members read state" on public.household_state;
create policy "members read state" on public.household_state for select
  using (public.role_in(household_id) is not null);

drop policy if exists "admins insert state" on public.household_state;
create policy "admins insert state" on public.household_state for insert
  with check (public.role_in(household_id) in ('owner','admin'));

drop policy if exists "admins update state" on public.household_state;
create policy "admins update state" on public.household_state for update
  using (public.role_in(household_id) in ('owner','admin'));

-- memberships
drop policy if exists "members read memberships" on public.memberships;
create policy "members read memberships" on public.memberships for select
  using (
    household_id in (
      select household_id from public.memberships where user_id = auth.uid()
    )
  );

drop policy if exists "owners insert memberships" on public.memberships;
create policy "owners insert memberships" on public.memberships for insert
  with check (public.role_in(household_id) = 'owner');

drop policy if exists "owners delete memberships" on public.memberships;
create policy "owners delete memberships" on public.memberships for delete
  using (public.role_in(household_id) = 'owner');

-- einsaetze: alle Mitglieder lesen; Employee nur eigene schreiben/ändern/löschen
drop policy if exists "members read einsaetze" on public.einsaetze;
create policy "members read einsaetze" on public.einsaetze for select
  using (public.role_in(household_id) is not null);

drop policy if exists "members insert own einsatz" on public.einsaetze;
create policy "members insert own einsatz" on public.einsaetze for insert with check (
  public.role_in(household_id) is not null and entered_by = auth.uid()
);

drop policy if exists "self or admin update einsatz" on public.einsaetze;
create policy "self or admin update einsatz" on public.einsaetze for update using (
  public.role_in(household_id) in ('owner','admin') or entered_by = auth.uid()
);

drop policy if exists "self or admin delete einsatz" on public.einsaetze;
create policy "self or admin delete einsatz" on public.einsaetze for delete using (
  public.role_in(household_id) in ('owner','admin') or entered_by = auth.uid()
);

-- invites
drop policy if exists "user reads own invites" on public.invites;
create policy "user reads own invites" on public.invites for select using (
  email = (select email from auth.users where id = auth.uid())
  or public.role_in(household_id) in ('owner','admin')
);

drop policy if exists "admins insert invites" on public.invites;
create policy "admins insert invites" on public.invites for insert
  with check (public.role_in(household_id) in ('owner','admin'));

drop policy if exists "admins delete invites" on public.invites;
create policy "admins delete invites" on public.invites for delete
  using (public.role_in(household_id) in ('owner','admin'));

-- =========================================================================
-- INVITE ACCEPTANCE RPC
-- =========================================================================

create or replace function public.accept_invite(invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invite public.invites%rowtype;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from public.invites
  where id = invite_id and lower(email) = lower(v_email) and accepted_at is null;

  if v_invite.id is null then
    raise exception 'Invite not found, already accepted, or email mismatch';
  end if;

  insert into public.memberships (household_id, user_id, role)
    values (v_invite.household_id, auth.uid(), v_invite.role)
    on conflict (household_id, user_id) do update set role = excluded.role;

  update public.invites set accepted_at = now() where id = v_invite.id;
  return v_invite.household_id;
end;
$$;

-- =========================================================================
-- AUTO-OWNER-HOUSEHOLD FOR NEW USERS WITHOUT PENDING INVITES
-- =========================================================================

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
    v_display_name := coalesce(new.raw_user_meta_data->>'full_name', new.email);
    insert into public.households (name)
      values (v_display_name || ' Haushalt')
      returning id into v_household_id;
    insert into public.memberships (household_id, user_id, role)
      values (v_household_id, new.id, 'owner');
    insert into public.household_state (household_id) values (v_household_id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- VIEW FOR MEMBERSHIPS WITH USER EMAIL (for the members tab)
-- =========================================================================

create or replace view public.membership_users
with (security_invoker = true)
as
  select m.household_id,
         m.user_id,
         m.role,
         m.created_at,
         u.email,
         u.raw_user_meta_data->>'full_name' as full_name
  from public.memberships m
  join auth.users u on u.id = m.user_id;
