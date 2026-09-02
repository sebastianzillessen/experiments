-- Per-family clock format. Times the app renders itself (the chips in the
-- planner, the detail sheet, sync stamps) follow this setting; the native
-- time picker keeps taking its format from the browser/OS, which no page can
-- override — the UI says so where it matters.
--
-- '24h' is the default: the paper planner this replaces is written that way.

alter table public.fp_families
  add column if not exists time_format text not null default '24h';

alter table public.fp_families drop constraint if exists fp_families_time_format_chk;
alter table public.fp_families add constraint fp_families_time_format_chk
  check (time_format in ('24h', '12h'));
