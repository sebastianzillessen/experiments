-- Add the monthly AHV allowance for employees at reference age (Rentner/innen)
-- to stored pay_settings. Employees marked as pensioners pay AHV/IV/EO and FAK
-- only on wages above this allowance (CHF 16'800/year = CHF 1'400/month), and
-- no ALV. The flag itself lives per employee in employees.data; this backfills
-- only the household-wide default amount so existing versions carry it
-- explicitly.
--
-- The period-lock trigger would reject updates to versions that already have
-- shifts, so we disable it for the backfill (same approach as the SVA 2026
-- rate migration). Only rows missing the key are touched.

alter table public.pay_settings disable trigger pay_settings_validate_update;

update public.pay_settings
set data = data || jsonb_build_object('ahvPensionerAllowanceMonthly', 1400)
where data is not null
  and not (data ? 'ahvPensionerAllowanceMonthly');

alter table public.pay_settings enable trigger pay_settings_validate_update;
