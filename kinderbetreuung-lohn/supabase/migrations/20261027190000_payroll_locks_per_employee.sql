-- Month sign-off becomes per employee. Until now a lock was one row per
-- household + month and closed the month for everyone; now each employee's
-- month is closed independently.

-- 1. Add the employee column (nullable while we backfill existing rows).
alter table public.payroll_locks
  add column employee_id uuid references public.employees(id) on delete cascade;

-- 2. Drop the old (household, month) uniqueness FIRST — the backfill below writes
--    several rows per household + month (one per employee), which that constraint
--    would reject.
alter table public.payroll_locks drop constraint if exists payroll_locks_household_id_month_key;

-- 3. Expand each existing household-wide lock into one row per employee that
--    has shifts in that month. Employees without shifts in a locked month had
--    nothing to lock, so they simply stay open.
insert into public.payroll_locks (household_id, month, employee_id, created_at, created_by)
select distinct l.household_id, l.month, s.employee_id, l.created_at, l.created_by
from public.payroll_locks l
join public.shifts s
  on s.household_id = l.household_id
 and date_trunc('month', s.date)::date = l.month
 and s.employee_id is not null
where l.employee_id is null;

-- 4. Drop the old household-wide rows and make the column mandatory.
delete from public.payroll_locks where employee_id is null;
alter table public.payroll_locks alter column employee_id set not null;

-- 5. Add the new (household, month, employee) uniqueness.
alter table public.payroll_locks
  add constraint payroll_locks_household_month_employee_key unique (household_id, month, employee_id);

-- 6. is_month_locked now answers per employee. Its signature changes, so drop
--    the old two-arg version first.
drop function if exists public.is_month_locked(uuid, date);
create or replace function public.is_month_locked(p_household_id uuid, p_date date, p_employee_id uuid)
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
      and employee_id = p_employee_id
  )
$$;

-- 7. The shifts trigger now checks the lock for the shift's own employee. A
--    shift with no employee cannot be locked (nothing to attribute it to).
create or replace function public.shifts_block_locked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.employee_id is not null
       and public.is_month_locked(old.household_id, old.date, old.employee_id) then
      raise exception 'Dieser Monat ist abgeschlossen und kann nicht mehr geändert werden'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if new.employee_id is not null
     and public.is_month_locked(new.household_id, new.date, new.employee_id) then
    raise exception 'Dieser Monat ist abgeschlossen und kann nicht mehr geändert werden'
      using errcode = 'P0001';
  end if;
  -- For an update also reject when the OLD row was in a closed month (so a shift
  -- cannot be moved out of a locked period).
  if tg_op = 'UPDATE' and old.employee_id is not null
     and public.is_month_locked(old.household_id, old.date, old.employee_id) then
    raise exception 'Dieser Monat ist abgeschlossen und kann nicht mehr geändert werden'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
