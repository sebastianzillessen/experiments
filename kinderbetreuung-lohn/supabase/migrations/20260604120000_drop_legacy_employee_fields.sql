-- Cleanup after 20260603120000_multiple_employees.
--
-- The per-employee Stammdaten and the hourly wage now live in `employees` and
-- `employee_wages`, and the frontend writes `shifts.employee_id` for every
-- shift. The earlier migration was deliberately additive (legacy columns kept so
-- the old single-employee UI kept working during the transition). The
-- multi-employee UI has since shipped, so we remove the now-unused legacy
-- storage and enforce the not-null invariant.
--
-- All data these fields held was already copied into the new tables by
-- 20260603120000, so this migration only drops redundant copies.

begin;

-- 1) Every shift must belong to an employee. Safety backfill first: assign any
--    orphan shift to its household's employee (prefer an active one; every
--    household has at least one employee row from the previous migration), then
--    make the column required. New shifts already always carry employee_id (the
--    UI sets it, and the shift_default_employee trigger fills single-employee
--    households), so this is the final tightening.
update public.shifts s
set employee_id = (
  select e.id
  from public.employees e
  where e.household_id = s.household_id
  order by (e.archived_at is not null), e.created_at
  limit 1
)
where s.employee_id is null;

alter table public.shifts
  alter column employee_id set not null;

-- 2) Drop the legacy single-employee Stammdaten column (migrated to `employees`).
--    `employer` stays on household_profile.
alter table public.household_profile
  drop column if exists employee;

-- 3) Strip the legacy hourly wage out of pay_settings.data (migrated to
--    `employee_wages`; pay_settings now holds only household-wide statutory
--    rates). The period-lock trigger rejects any update to a locked version, so
--    disable it just for this one maintenance update, then re-enable.
alter table public.pay_settings disable trigger pay_settings_validate_update;
update public.pay_settings
set data = data - 'hourlyRate'
where data ? 'hourlyRate';
alter table public.pay_settings enable trigger pay_settings_validate_update;

commit;
