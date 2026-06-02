-- Vacation entitlement moves from the versioned pay_settings to the employee.
--
-- Ferienanspruch (4/5/6 weeks → Ferienzulage 8.33/10.63/13.04 %) is a property
-- of the employee, selected once in the Stammdaten (like the ≥8h NBU flag),
-- and the calculation derives the percentage from it. The free-text
-- vacationPercent field on pay_settings is therefore removed.

-- Default every existing employee to 4 weeks (8.33 %), the previous default.
update public.household_profile
set employee = coalesce(employee, '{}'::jsonb) || jsonb_build_object('vacationWeeks', 4)
where employee->>'vacationWeeks' is null;

-- Drop the now-unused vacationPercent key from stored pay_settings versions.
-- Pre-production data, so the period-lock trigger is bypassed for the rewrite.
alter table public.pay_settings disable trigger pay_settings_validate_update;

update public.pay_settings
set data = data - 'vacationPercent'
where data ? 'vacationPercent';

alter table public.pay_settings enable trigger pay_settings_validate_update;
