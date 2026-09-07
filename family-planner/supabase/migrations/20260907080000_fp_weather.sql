-- The weather for the hours the family plans in.
--
-- One postal code per family, and one cached forecast beside it. MeteoSwiss is
-- asked at most once an hour however many screens are open, the same bargain
-- the calendars make.

alter table public.fp_families
  add column if not exists weather_plz text;

alter table public.fp_families drop constraint if exists fp_families_weather_plz_chk;
alter table public.fp_families add constraint fp_families_weather_plz_chk
  check (weather_plz is null or weather_plz ~ '^[1-9][0-9]{3}$');

-- What the function worked out, ready to render:
--   [{ "date": "2026-09-07", "tempMin": 18, "tempMax": 31,
--      "precipitation": 0, "sunshine": 0.44, "hours": 10 }]
create table if not exists public.fp_weather_cache (
  family_id uuid primary key references public.fp_families(id) on delete cascade,
  -- Kept beside the days so a changed postal code is visibly stale rather than
  -- quietly showing the old town's weather.
  plz text not null,
  days jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.fp_weather_cache enable row level security;

-- Every member reads it; the plan on the wall is the point. Writing is the
-- Edge Function's job with the service-role key, so there is no write policy.
drop policy if exists "fp members read weather" on public.fp_weather_cache;
create policy "fp members read weather" on public.fp_weather_cache for select
  using (public.fp_role_in(family_id) is not null);
