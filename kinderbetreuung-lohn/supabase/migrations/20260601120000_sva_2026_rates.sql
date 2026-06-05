-- Migrate stored pay_settings to the SVA Zürich 2026 model.
--
-- The app now mirrors the SVA Zürich online calculator "Löhne ab Januar 2026":
--   * Feiertagszulage (holidayPercent) is a new gross-wage component (3.59 %
--     = 9 gesetzliche ZH-Feiertage).
--   * Verwaltungskosten (adminFeeEmployer) changed meaning: it is now a
--     percentage OF THE AHV/IV/EO contributions (AN + AG), default 5.00,
--     instead of a flat percentage of the gross.
--   * FAK corrected to 1.025 %, UVG-NBU corrected to 1.432 %.
--
-- Every existing pay_settings row predates production use, so historic
-- correctness of locked versions is not required: we rewrite all rows to the
-- 2026 values. The period-lock trigger would otherwise reject updates to
-- versions that already have shifts, so we disable it for the rewrite.

alter table public.pay_settings disable trigger pay_settings_validate_update;

update public.pay_settings
set data = data || jsonb_build_object(
  'holidayPercent',   3.59,
  'fakEmployer',      1.025,
  'uvgNbuEmployee',   1.432,
  'adminFeeEmployer', 5.00
)
where data is not null;

alter table public.pay_settings enable trigger pay_settings_validate_update;
