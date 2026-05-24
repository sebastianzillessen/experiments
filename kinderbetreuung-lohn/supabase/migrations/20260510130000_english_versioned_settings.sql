-- Versioned pay_settings + English schema rename.
--
-- Background: rates (Stundenlohn, Ferienzulage, SV-Sätze, UVG) only ever
-- change at month boundaries (e.g. Lohnerhöhung per 1.4.) — never within
-- a month. Instead of snapshotting per Einsatz, we keep one versioned
-- pay_settings table where each row is "effective from <first of month>",
-- and any shift looks up the active version by date. Past versions become
-- read-only as soon as a shift falls inside their effective period, so a
-- "Lohnerhöhung" cannot retroactively change a Lohnabrechnung.
--
-- Same migration also renames the data model from German to English. The
-- UI stays in German; only DB tables, columns, and JSONB keys change.
-- Existing einsaetze and einstellungen are dropped (still pre-production).
-- Stammdaten (households, memberships, household_state) are renamed in
-- place without data loss.

-- =========================================================================
-- DROP LEGACY DATA MODEL
-- =========================================================================

drop table if exists public.einsaetze cascade;

alter table public.household_state
  drop column if exists einstellungen;

-- =========================================================================
-- RENAME household_state -> household_profile (employer/employee)
-- =========================================================================

alter table public.household_state rename to household_profile;
alter table public.household_profile rename column arbeitgeber to employer;
alter table public.household_profile rename column arbeitnehmer to employee;

-- Re-anchor RLS policies that referenced the old name.
drop policy if exists "members read state"  on public.household_profile;
drop policy if exists "admins insert state" on public.household_profile;
drop policy if exists "admins update state" on public.household_profile;

create policy "members read profile" on public.household_profile for select
  using (public.role_in(household_id) is not null);

create policy "admins insert profile" on public.household_profile for insert
  with check (public.role_in(household_id) in ('owner','admin'));

create policy "admins update profile" on public.household_profile for update
  using (public.role_in(household_id) in ('owner','admin'));

-- =========================================================================
-- NEW: shifts (was einsaetze)
-- =========================================================================

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  hours numeric(6,2) not null check (hours > 0),
  note text not null default '',
  entered_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index shifts_household_date_idx
  on public.shifts (household_id, date);

alter table public.shifts enable row level security;

create policy "members read shifts" on public.shifts for select
  using (public.role_in(household_id) is not null);

create policy "members insert own shift" on public.shifts for insert
  with check (
    public.role_in(household_id) is not null and entered_by = auth.uid()
  );

create policy "self or admin update shift" on public.shifts for update
  using (
    public.role_in(household_id) in ('owner','admin') or entered_by = auth.uid()
  );

create policy "self or admin delete shift" on public.shifts for delete
  using (
    public.role_in(household_id) in ('owner','admin') or entered_by = auth.uid()
  );

-- =========================================================================
-- NEW: pay_settings (versioned, was household_state.einstellungen)
-- =========================================================================

create table public.pay_settings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  effective_month date not null check (extract(day from effective_month) = 1),
  data jsonb not null,
  created_at timestamptz not null default now(),
  unique (household_id, effective_month)
);

create index pay_settings_household_effective_month_idx
  on public.pay_settings (household_id, effective_month desc);

alter table public.pay_settings enable row level security;

create policy "members read pay_settings" on public.pay_settings for select
  using (public.role_in(household_id) is not null);

create policy "admins insert pay_settings" on public.pay_settings for insert
  with check (public.role_in(household_id) in ('owner','admin'));

create policy "admins update pay_settings" on public.pay_settings for update
  using (public.role_in(household_id) in ('owner','admin'));

create policy "admins delete pay_settings" on public.pay_settings for delete
  using (public.role_in(household_id) in ('owner','admin'));

-- =========================================================================
-- HELPER: active pay_settings for a given date
-- =========================================================================

-- Runs with the caller's privileges so RLS on pay_settings applies (only
-- household members see their own rows). No security definer needed.
create or replace function public.pay_settings_active(p_household_id uuid, p_date date)
returns jsonb
language sql
stable
set search_path = public
as $$
  select data from public.pay_settings
  where household_id = p_household_id
    and effective_month <= p_date
  order by effective_month desc
  limit 1
$$;

-- =========================================================================
-- TRIGGERS: enforce that a version cannot change the active settings of
-- shifts that already exist.
-- =========================================================================

-- INSERT: new version V is rejected if any shift exists with date >= V.effective_month
-- for the household (would shift the active version of those existing shifts).
create or replace function public.pay_settings_validate_insert()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.shifts
    where household_id = new.household_id
      and date >= new.effective_month
  ) then
    raise exception
      'Cannot insert pay_settings effective % — shifts already exist on or after that date',
      new.effective_month
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists pay_settings_validate_insert on public.pay_settings;
create trigger pay_settings_validate_insert
  before insert on public.pay_settings
  for each row execute function public.pay_settings_validate_insert();

-- UPDATE: only data is mutable. effective_month and household_id are immutable.
-- Reject if any shift exists in [V.effective_month, NEXT.effective_month).
create or replace function public.pay_settings_validate_update()
returns trigger
language plpgsql
as $$
declare
  v_next_month date;
begin
  if new.household_id <> old.household_id then
    raise exception 'household_id is immutable on pay_settings'
      using errcode = 'P0001';
  end if;
  if new.effective_month <> old.effective_month then
    raise exception 'effective_month is immutable on pay_settings (delete + insert instead)'
      using errcode = 'P0001';
  end if;

  select min(effective_month) into v_next_month
  from public.pay_settings
  where household_id = old.household_id
    and effective_month > old.effective_month;

  if exists (
    select 1 from public.shifts
    where household_id = old.household_id
      and date >= old.effective_month
      and (v_next_month is null or date < v_next_month)
  ) then
    raise exception
      'Cannot update pay_settings effective % — shifts exist within its period',
      old.effective_month
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists pay_settings_validate_update on public.pay_settings;
create trigger pay_settings_validate_update
  before update on public.pay_settings
  for each row execute function public.pay_settings_validate_update();

-- DELETE: same period check as UPDATE.
create or replace function public.pay_settings_validate_delete()
returns trigger
language plpgsql
as $$
declare
  v_next_month date;
begin
  select min(effective_month) into v_next_month
  from public.pay_settings
  where household_id = old.household_id
    and effective_month > old.effective_month;

  if exists (
    select 1 from public.shifts
    where household_id = old.household_id
      and date >= old.effective_month
      and (v_next_month is null or date < v_next_month)
  ) then
    raise exception
      'Cannot delete pay_settings effective % — shifts exist within its period',
      old.effective_month
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists pay_settings_validate_delete on public.pay_settings;
create trigger pay_settings_validate_delete
  before delete on public.pay_settings
  for each row execute function public.pay_settings_validate_delete();

-- =========================================================================
-- UPDATE handle_new_user / create_household_for_self to reference the
-- renamed household_profile table (keeps signup + self-service working).
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
    insert into public.household_profile (household_id) values (v_household_id);
  end if;

  return new;
end;
$$;

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

  insert into public.household_profile (household_id)
    values (v_household_id);

  return v_household_id;
end;
$$;
