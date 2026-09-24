-- Month sign-off / lock. Finalising a Monatsabrechnung records a lock for that
-- household + month. Afterwards the month's shifts are read-only (the DB rejects
-- insert/update/delete) and they drop out of the Stundenerfassung overview.
-- Per household + month: the common case is one employee, and "close this month"
-- is a clear, all-or-nothing action.

create table public.payroll_locks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  month date not null check (extract(day from month) = 1), -- first day of the locked month
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (household_id, month)
);
create index payroll_locks_household_idx on public.payroll_locks (household_id);

alter table public.payroll_locks enable row level security;

create policy "members read payroll_locks" on public.payroll_locks for select
  using (public.role_in(household_id) is not null);

create policy "admins insert payroll_locks" on public.payroll_locks for insert
  with check (public.role_in(household_id) in ('owner', 'admin'));

create policy "admins delete payroll_locks" on public.payroll_locks for delete
  using (public.role_in(household_id) in ('owner', 'admin'));

-- Is this household's month closed? Security definer so the shifts trigger can
-- see locks regardless of the writer's own RLS.
create or replace function public.is_month_locked(p_household_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.payroll_locks
    where household_id = p_household_id
      and month = date_trunc('month', p_date)::date
  )
$$;

-- Reject any write to a shift that falls in a closed month. For an update also
-- reject when the OLD row was in a closed month (so a shift cannot be moved out
-- of a locked period).
create or replace function public.shifts_block_locked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if public.is_month_locked(old.household_id, old.date) then
      raise exception 'Dieser Monat ist abgeschlossen und kann nicht mehr geändert werden'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if public.is_month_locked(new.household_id, new.date) then
    raise exception 'Dieser Monat ist abgeschlossen und kann nicht mehr geändert werden'
      using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and public.is_month_locked(old.household_id, old.date) then
    raise exception 'Dieser Monat ist abgeschlossen und kann nicht mehr geändert werden'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists shifts_block_locked on public.shifts;
create trigger shifts_block_locked
  before insert or update or delete on public.shifts
  for each row execute function public.shifts_block_locked();
