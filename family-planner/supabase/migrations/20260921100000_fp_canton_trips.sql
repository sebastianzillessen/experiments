-- All 26 cantons, once, with the children.
--
-- The cantons themselves are not in the database: there are 26 of them, the
-- list last changed in 1979, and a table would only be a copy of the
-- constitution that can drift. They live in the client as a constant, and what
-- belongs to a family lands here — the trips.
--
-- A canton counts as visited when one of its trips is ticked off. Nothing
-- stores "visited" separately: a flag beside the trips is a second truth to
-- keep in step, and the trip already says when it was and what it was.

create table if not exists public.fp_trips (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.fp_families(id) on delete cascade,
  -- The 26 two-letter codes, as the cantons themselves write them. A check
  -- constraint rather than free text: this list is settled.
  canton text not null check (canton in (
    'AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU','NE',
    'NW','OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH'
  )),
  title text not null,
  notes text not null default '',
  -- Both null while it is only an idea with a canton attached; to_date is set
  -- only for something spanning nights.
  from_date date,
  to_date date,
  done boolean not null default false,
  -- When it happened. Usually from_date, but a trip can be ticked off without
  -- ever having had a planned date.
  done_on date,
  -- Whether the family wrote it themselves or took it from a suggestion, so
  -- the suggestions can be judged by what actually got done.
  source text not null default 'eigen' check (source in ('eigen', 'idee')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint fp_trips_title_chk check (length(btrim(title)) between 1 and 120),
  constraint fp_trips_dates_chk check (
    (to_date is null or from_date is not null)
    and (to_date is null or to_date >= from_date)
  )
);
create index if not exists fp_trips_family_idx on public.fp_trips (family_id, canton);

-- What the model suggested for a canton, kept so it can be read again without
-- paying for it twice. Replaced wholesale when someone asks for new ideas —
-- these are proposals, not records, and there is nothing to merge.
create table if not exists public.fp_trip_ideas (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.fp_families(id) on delete cascade,
  canton text not null,
  title text not null,
  summary text not null default '',
  -- Two or three concrete things to do there.
  highlights text[] not null default '{}',
  duration text not null default 'tag' check (duration in ('tag', 'zwei-tage')),
  -- When it is worth going, and how to get there — both in plain words, both
  -- allowed to be empty when the model has nothing solid to say.
  season text not null default '',
  travel text not null default '',
  -- What was asked for ("mit Kinderwagen, max. 2 h Fahrt"), so a stale batch
  -- is recognisable as having been generated for something else.
  wishes text not null default '',
  generated_at timestamptz not null default now()
);
create index if not exists fp_trip_ideas_family_idx on public.fp_trip_ideas (family_id, canton);

alter table public.fp_trips enable row level security;
alter table public.fp_trip_ideas enable row level security;

-- Reading is for every member: the point is the whole family seeing where
-- they have been.
drop policy if exists "fp members read trips" on public.fp_trips;
create policy "fp members read trips" on public.fp_trips for select
  using (public.fp_role_in(family_id) is not null);

drop policy if exists "fp members read trip ideas" on public.fp_trip_ideas;
create policy "fp members read trip ideas" on public.fp_trip_ideas for select
  using (public.fp_role_in(family_id) is not null);

drop policy if exists "fp editors write trips" on public.fp_trips;
create policy "fp editors write trips" on public.fp_trips for all
  using (public.fp_can_edit(family_id))
  with check (public.fp_can_edit(family_id));

-- Ideas are written by the Edge Function with the service-role key. Throwing
-- one away is the client's business, though — a suggestion nobody wants
-- should not need an API call to disappear.
drop policy if exists "fp editors delete trip ideas" on public.fp_trip_ideas;
create policy "fp editors delete trip ideas" on public.fp_trip_ideas for delete
  using (public.fp_can_edit(family_id));
