-- The school lunch menu: where it comes from, what was read, and who eats it.
--
-- Three tables rather than one, because the three change on different clocks.
-- The source is configured once and edited rarely. A week is written by the
-- import and never edited by hand. The assignment of children changes when a
-- child changes school or school days, which is its own rhythm again.

-- Where a school publishes its menu. A family can have several: children at
-- two schools eat two different lunches.
create table if not exists public.fp_menu_sources (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.fp_families(id) on delete cascade,
  label text not null,
  -- Folder the files live in. https only, checked again in the function.
  base_url text not null,
  -- Filled in per week with {KW}, {JJ}, {MM}, {TT} and friends. Several
  -- because one school is often inconsistent with itself — a week below ten
  -- may or may not be padded — and trying both beats guessing.
  path_patterns text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint fp_menu_sources_patterns_chk check (array_length(path_patterns, 1) between 1 and 5)
);
create index if not exists fp_menu_sources_family_idx
  on public.fp_menu_sources (family_id, created_at);

-- One imported week. `days` holds what the model read, already checked against
-- the week it was asked for:
--   [{ "date": "2026-09-07", "dishes": [{ "name": "Lasagne (R)", "tags": [...] }] }]
create table if not exists public.fp_menu_weeks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.fp_families(id) on delete cascade,
  source_id uuid not null references public.fp_menu_sources(id) on delete cascade,
  year int not null,
  week int not null check (week between 1 and 53),
  from_date date not null,
  to_date date not null,
  -- What was actually fetched, or null when someone uploaded the file.
  source_url text,
  days jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id) on delete set null,
  unique (source_id, year, week)
);
create index if not exists fp_menu_weeks_family_idx
  on public.fp_menu_weeks (family_id, from_date);

-- Which child eats there, and on which days. A child in school Monday to
-- Wednesday must not be shown Thursday's lunch.
create table if not exists public.fp_menu_people (
  source_id uuid not null references public.fp_menu_sources(id) on delete cascade,
  person_id uuid not null references public.fp_people(id) on delete cascade,
  -- 1 = Monday … 5 = Friday, the same count as the rest of the app uses for
  -- weekdays minus the weekend the menu never covers.
  weekdays smallint[] not null default '{1,2,3,4,5}',
  primary key (source_id, person_id),
  constraint fp_menu_people_weekdays_chk check (
    array_length(weekdays, 1) between 1 and 5
    and weekdays <@ array[1,2,3,4,5]::smallint[]
  )
);

-- The family a source belongs to, so the policies on fp_menu_people can reach
-- it in one hop. security definer for the same reason fp_event_family is.
create or replace function public.fp_menu_source_family(s uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.fp_menu_sources where id = s
$$;

alter table public.fp_menu_sources enable row level security;
alter table public.fp_menu_weeks enable row level security;
alter table public.fp_menu_people enable row level security;

-- Reading is for every member: the plan on the wall is the point.
drop policy if exists "fp members read menu sources" on public.fp_menu_sources;
create policy "fp members read menu sources" on public.fp_menu_sources for select
  using (public.fp_role_in(family_id) is not null);

drop policy if exists "fp members read menu weeks" on public.fp_menu_weeks;
create policy "fp members read menu weeks" on public.fp_menu_weeks for select
  using (public.fp_role_in(family_id) is not null);

drop policy if exists "fp members read menu people" on public.fp_menu_people;
create policy "fp members read menu people" on public.fp_menu_people for select
  using (public.fp_role_in(public.fp_menu_source_family(source_id)) is not null);

-- Configuring a source is an owner's job: it points the importer at an address
-- and every run costs money.
drop policy if exists "fp owners write menu sources" on public.fp_menu_sources;
create policy "fp owners write menu sources" on public.fp_menu_sources for all
  using (public.fp_role_in(family_id) = 'owner')
  with check (public.fp_role_in(family_id) = 'owner');

-- Who eats where is ordinary planning, so editors may say.
drop policy if exists "fp editors write menu people" on public.fp_menu_people;
create policy "fp editors write menu people" on public.fp_menu_people for all
  using (public.fp_can_edit(public.fp_menu_source_family(source_id)))
  with check (public.fp_can_edit(public.fp_menu_source_family(source_id)));

-- Weeks are written by the Edge Function with the service-role key, which
-- bypasses RLS. Deleting one is how a family drops a misread import, so that
-- much is allowed from the client.
drop policy if exists "fp editors delete menu weeks" on public.fp_menu_weeks;
create policy "fp editors delete menu weeks" on public.fp_menu_weeks for delete
  using (public.fp_can_edit(family_id));
