-- Optional start/end time on an hourly shift. The Stundenerfassung form lets the
-- employee enter "Von"/"Bis"; the hours are computed from them but until now only
-- the hours were stored. Persist the raw times too so the entries overview can
-- show "7:30-17:00" instead of the employee having to write it into the note.
--
-- Both nullable: Monatslohn markers and shifts entered as a plain hours number
-- have no times, and existing rows keep NULLs. Nothing else changes — hours stays
-- the authoritative figure for payroll; these columns are display-only context.
alter table public.shifts
  add column if not exists start_time time,
  add column if not exists end_time time;
