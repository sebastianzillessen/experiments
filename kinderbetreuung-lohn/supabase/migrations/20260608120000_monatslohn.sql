-- =========================================================================
-- Monatslohn (fixed monthly salary) support.
--
-- Employees can be paid a fixed monthly salary instead of by the hour. Such
-- employees enter no hours; the admin confirms each month with a lightweight
-- "month entry" that reuses the shifts table as a NULL-hours marker row.
--
--   * employee_wages gains `monthly_salary` (a Monatslohn version carries this
--     instead of `hourly_rate`); `hourly_rate` becomes nullable. The employee's
--     employmentType (stored in employees.data JSONB) decides which is used.
--   * shifts.hours becomes nullable: a NULL-hours row is a Monatslohn month
--     marker. The existing period-lock triggers on employee_wages key on
--     `shifts.date >= effective_month`, so a confirmed month correctly locks the
--     salary version of that period — no trigger changes needed.
-- =========================================================================

-- employee_wages: add monthly_salary, relax hourly_rate to nullable.
alter table public.employee_wages
  add column monthly_salary numeric(10,2) check (monthly_salary >= 0);

alter table public.employee_wages
  alter column hourly_rate drop not null;

-- shifts: allow NULL hours (Monatslohn month marker); hourly rows still > 0.
alter table public.shifts
  alter column hours drop not null;

alter table public.shifts
  drop constraint if exists shifts_hours_check;

alter table public.shifts
  add constraint shifts_hours_check check (hours is null or hours > 0);
