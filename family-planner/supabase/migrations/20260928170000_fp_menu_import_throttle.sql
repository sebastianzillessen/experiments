-- When this family last asked for a menu, so the automatic fetch cannot run away.
--
-- Every device with edit rights now fetches a missing week by itself, which is
-- what makes the plan appear without anyone pressing a button — and also what
-- would let four tablets pay for the same PDF four times. The stamp lives on
-- the family, not on the device, because that is the thing being protected:
-- one import per family per half hour, whichever screen asks.
--
-- Only automatic fetches are held back. Someone pressing the button expects it
-- to run, and a button that silently does nothing is worse than a second call.

alter table public.fp_families
  add column if not exists menu_import_attempted_at timestamptz;

comment on column public.fp_families.menu_import_attempted_at is
  'Last automatic or manual menu import attempt; throttles the automatic ones.';
