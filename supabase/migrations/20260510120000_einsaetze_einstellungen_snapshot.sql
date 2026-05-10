-- Persist the rates (Stundenlohn, Ferienzulage, SV-Beitragssätze, UVG) that
-- were active when an Einsatz was entered, so that later changes to
-- household_state.einstellungen (e.g. Lohnerhöhung) don't retroactively
-- recalculate past Einsätze and Lohnabrechnungen.

alter table public.einsaetze
  add column if not exists einstellungen jsonb;

-- Backfill: existing rows get the current household_state.einstellungen.
-- This is best-effort — if a household has no state row yet, the snapshot
-- stays empty and the client falls back to its defaults.
update public.einsaetze e
set einstellungen = hs.einstellungen
from public.household_state hs
where e.household_id = hs.household_id
  and e.einstellungen is null;

update public.einsaetze
set einstellungen = '{}'::jsonb
where einstellungen is null;

alter table public.einsaetze
  alter column einstellungen set default '{}'::jsonb,
  alter column einstellungen set not null;
