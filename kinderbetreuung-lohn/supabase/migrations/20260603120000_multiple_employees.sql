-- Multiple employees per household.
--
-- Background: until now a household had exactly one Arbeitnehmer — their
-- Stammdaten lived in household_profile.employee (1:1), the hourly wage lived
-- in the household-wide versioned pay_settings.data.hourlyRate, and shifts had
-- no link to a person. We now let a household employ several people, each with
-- their own Stammdaten and their own versioned hourly wage, while the statutory
-- /cantonal rates (AHV/IV/EO, ALV, FAK, UVG, Feiertagszulage, Quellensteuer,
-- Verwaltungskosten) stay household-wide in pay_settings (one place to maintain).
--
-- This migration is intentionally ADDITIVE and backward compatible: the live
-- frontend still reads/writes household_profile.employee and
-- pay_settings.data.hourlyRate, so those columns/keys are kept. New structures
-- are backfilled from the existing data, and shifts.employee_id is nullable with
-- an auto-backfill trigger so the unchanged UI keeps working. The UI rewrite and
-- the later cleanup (NOT NULL + dropping the legacy columns) are a follow-up.

-- =========================================================================
-- 1. employees: Stammdaten per employee, with an OPTIONAL login link
-- =========================================================================

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Stammdaten: name, address, zip, city, country, birthDate, ahvNumber,
  -- iban, weeklyHoursThreshold8h, vacationWeeks (same shape as the old
  -- household_profile.employee JSONB).
  data jsonb not null default '{}'::jsonb,
  -- Optional: links this employee record to a login (set when an invite that
  -- carries employee_id is accepted). Null = pure Stammdaten, no login yet.
  user_id uuid references auth.users(id) on delete set null,
  -- Inactive employees keep their historical shifts/payslips; just hidden.
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index employees_household_idx on public.employees (household_id);

-- A given login maps to at most one employee record per household.
create unique index employees_user_uidx
  on public.employees (household_id, user_id) where user_id is not null;

alter table public.employees enable row level security;

create policy "members read employees" on public.employees for select
  using (public.role_in(household_id) is not null);

create policy "admins insert employees" on public.employees for insert
  with check (public.role_in(household_id) in ('owner','admin'));

-- WITH CHECK on the NEW row too, so an admin cannot move an employee into a
-- household where they have no (owner/admin) role via an UPDATE of household_id.
create policy "admins update employees" on public.employees for update
  using (public.role_in(household_id) in ('owner','admin'))
  with check (public.role_in(household_id) in ('owner','admin'));

create policy "admins delete employees" on public.employees for delete
  using (public.role_in(household_id) in ('owner','admin'));

-- Security-definer helpers so policies on OTHER tables can resolve an
-- employee's household / linked login without tripping over employees' own RLS.
create or replace function public.employee_household(p_employee_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.employees where id = p_employee_id
$$;

create or replace function public.employee_user(p_employee_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.employees where id = p_employee_id
$$;

-- Backfill: one employee per existing household (from household_profile.employee).
-- Every household has exactly one household_profile row (handle_new_user).
insert into public.employees (household_id, data)
  select household_id, coalesce(employee, '{}'::jsonb)
  from public.household_profile;

-- =========================================================================
-- 2. shifts.employee_id (nullable, backward compatible)
-- =========================================================================

-- NO ACTION (the default) on delete: an employee with shifts cannot be hard
-- deleted, so historical shifts/payslips are preserved (employees are archived
-- via archived_at instead). Deleting a whole household still works — shifts are
-- removed first via shifts.household_id ON DELETE CASCADE, so the check passes.
alter table public.shifts
  add column employee_id uuid references public.employees(id);

create index shifts_employee_date_idx on public.shifts (employee_id, date);

-- Backfill: attribute every existing shift to its household's (single) employee.
update public.shifts s
  set employee_id = e.id
  from public.employees e
  where e.household_id = s.household_id;

-- Auto-backfill on insert: if the caller (e.g. the legacy single-employee UI)
-- does not supply employee_id, attach the household's sole employee. With more
-- than one employee it stays null and the new UI must set it explicitly.
create or replace function public.shift_default_employee()
returns trigger
language plpgsql
as $$
declare
  v_count int;
begin
  if new.employee_id is null then
    -- Only attach automatically when the household has exactly one active
    -- employee; otherwise leave it null (the new UI sets it explicitly).
    select count(*) into v_count
    from public.employees
    where household_id = new.household_id
      and archived_at is null;
    if v_count = 1 then
      select id into new.employee_id
      from public.employees
      where household_id = new.household_id
        and archived_at is null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists shift_default_employee on public.shifts;
create trigger shift_default_employee
  before insert on public.shifts
  for each row execute function public.shift_default_employee();

-- Re-fit the shift write policies for "employee only for themselves, admin for
-- everyone". Read stays unchanged. Insert now enforces that, if an employee_id
-- is given, it belongs to this household, and a non-admin may only attribute a
-- shift to their own linked employee record (or leave it null for the legacy
-- single-employee auto-backfill path). Update/delete keep the existing
-- entered_by self-path (backward compatible) and additionally let a linked
-- employee manage shifts attributed to them.
drop policy if exists "members insert own shift" on public.shifts;
create policy "members insert shift" on public.shifts for insert
  with check (
    public.role_in(household_id) is not null
    and entered_by = auth.uid()
    and (employee_id is null or public.employee_household(employee_id) = household_id)
    and (
      -- owner/admin may attribute to anyone (or leave it null for the
      -- single-employee auto-backfill trigger); a non-admin must end up on
      -- their own linked record (the trigger fills it in single-employee
      -- households, otherwise the new UI sets it) — never null, never a colleague.
      public.role_in(household_id) in ('owner','admin')
      or public.employee_user(employee_id) = auth.uid()
    )
  );

-- WITH CHECK mirrors the insert policy: a non-admin may only leave employee_id
-- null or point it at their own linked record, so they cannot re-attribute a
-- shift to a different employee in the household (only owner/admin can).
drop policy if exists "self or admin update shift" on public.shifts;
create policy "self or admin update shift" on public.shifts for update
  using (
    public.role_in(household_id) in ('owner','admin')
    or entered_by = auth.uid()
    or public.employee_user(employee_id) = auth.uid()
  )
  with check (
    (employee_id is null or public.employee_household(employee_id) = household_id)
    and (
      -- A non-admin may only keep a shift on their own linked record — they
      -- cannot re-attribute it to a colleague nor orphan it (set null).
      public.role_in(household_id) in ('owner','admin')
      or public.employee_user(employee_id) = auth.uid()
    )
  );

drop policy if exists "self or admin delete shift" on public.shifts;
create policy "self or admin delete shift" on public.shifts for delete
  using (
    public.role_in(household_id) in ('owner','admin')
    or entered_by = auth.uid()
    or public.employee_user(employee_id) = auth.uid()
  );

-- =========================================================================
-- 3. employee_wages: per-employee versioned hourly wage
--    (mirrors the pay_settings versioning, but keyed on the employee)
-- =========================================================================

create table public.employee_wages (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  effective_month date not null check (extract(day from effective_month) = 1),
  hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
  created_at timestamptz not null default now(),
  unique (employee_id, effective_month)
);

create index employee_wages_emp_month_idx
  on public.employee_wages (employee_id, effective_month desc);

alter table public.employee_wages enable row level security;

create policy "members read employee_wages" on public.employee_wages for select
  using (public.role_in(public.employee_household(employee_id)) is not null);

create policy "admins insert employee_wages" on public.employee_wages for insert
  with check (public.role_in(public.employee_household(employee_id)) in ('owner','admin'));

create policy "admins update employee_wages" on public.employee_wages for update
  using (public.role_in(public.employee_household(employee_id)) in ('owner','admin'))
  with check (public.role_in(public.employee_household(employee_id)) in ('owner','admin'));

create policy "admins delete employee_wages" on public.employee_wages for delete
  using (public.role_in(public.employee_household(employee_id)) in ('owner','admin'));

-- Active hourly wage for an employee on a given date (newest effective_month
-- on or before the date). Runs with the caller's privileges so RLS applies.
create or replace function public.employee_wage_active(p_employee_id uuid, p_date date)
returns numeric
language sql
stable
set search_path = public
as $$
  select hourly_rate from public.employee_wages
  where employee_id = p_employee_id
    and effective_month <= p_date
  order by effective_month desc
  limit 1
$$;

-- Backfill wage versions from the existing household-wide pay_settings BEFORE
-- the period-lock triggers exist, so the (already attributed) shifts do not
-- block the historical rewrite. One row per pay_settings version, attributed to
-- the household's single migrated employee.
insert into public.employee_wages (employee_id, effective_month, hourly_rate)
  select e.id,
         ps.effective_month,
         coalesce((ps.data->>'hourlyRate')::numeric, 0)
  from public.pay_settings ps
  join public.employees e on e.household_id = ps.household_id;

-- Period-lock triggers (analogous to pay_settings_validate_*): a wage version
-- becomes read-only once shifts for THIS employee fall inside its period, so a
-- Lohnerhöhung cannot retroactively change an existing Lohnabrechnung.
create or replace function public.employee_wages_validate_insert()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.shifts
    where employee_id = new.employee_id
      and date >= new.effective_month
  ) then
    raise exception
      'Cannot insert employee_wages effective % — shifts already exist on or after that date',
      new.effective_month
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists employee_wages_validate_insert on public.employee_wages;
create trigger employee_wages_validate_insert
  before insert on public.employee_wages
  for each row execute function public.employee_wages_validate_insert();

create or replace function public.employee_wages_validate_update()
returns trigger
language plpgsql
as $$
declare
  v_next_month date;
begin
  if new.employee_id <> old.employee_id then
    raise exception 'employee_id is immutable on employee_wages'
      using errcode = 'P0001';
  end if;
  if new.effective_month <> old.effective_month then
    raise exception 'effective_month is immutable on employee_wages (delete + insert instead)'
      using errcode = 'P0001';
  end if;

  select min(effective_month) into v_next_month
  from public.employee_wages
  where employee_id = old.employee_id
    and effective_month > old.effective_month;

  if exists (
    select 1 from public.shifts
    where employee_id = old.employee_id
      and date >= old.effective_month
      and (v_next_month is null or date < v_next_month)
  ) then
    raise exception
      'Cannot update employee_wages effective % — shifts exist within its period',
      old.effective_month
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists employee_wages_validate_update on public.employee_wages;
create trigger employee_wages_validate_update
  before update on public.employee_wages
  for each row execute function public.employee_wages_validate_update();

create or replace function public.employee_wages_validate_delete()
returns trigger
language plpgsql
as $$
declare
  v_next_month date;
begin
  select min(effective_month) into v_next_month
  from public.employee_wages
  where employee_id = old.employee_id
    and effective_month > old.effective_month;

  if exists (
    select 1 from public.shifts
    where employee_id = old.employee_id
      and date >= old.effective_month
      and (v_next_month is null or date < v_next_month)
  ) then
    raise exception
      'Cannot delete employee_wages effective % — shifts exist within its period',
      old.effective_month
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists employee_wages_validate_delete on public.employee_wages;
create trigger employee_wages_validate_delete
  before delete on public.employee_wages
  for each row execute function public.employee_wages_validate_delete();

-- =========================================================================
-- 4. Optional login link via invite
-- =========================================================================

alter table public.invites
  add column employee_id uuid references public.employees(id) on delete set null;

-- accept_invite re-defined: after creating the membership, if the invite is
-- tied to an employee record that has no login yet, link it to this user.
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

  -- Optional employee link: only fill an as-yet unlinked record in the same
  -- household. Without employee_id the invite behaves exactly as before.
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
