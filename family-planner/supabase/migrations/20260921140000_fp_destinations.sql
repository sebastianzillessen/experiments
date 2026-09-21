-- Ziele, not cantons.
--
-- The first version hard-coded the 26 cantons, which was right for the family
-- that asked for it and wrong for everyone else: the next family wants the
-- countries of Europe, or the lakes, or every Bergbahn in the country. A list
-- of places somebody wants to get through is the general shape; the cantons
-- are one starting point among several.
--
-- So the list moves into the database, where a family can add to it, and the
-- grouping is free text — the same bargain fp_tasks.area struck: no migration
-- needed the day someone invents a corner of their own life.

create table if not exists public.fp_destinations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.fp_families(id) on delete cascade,
  name text not null,
  -- The badge in the list: "GR", "FR", "1". Optional — "Toskana" needs none.
  code text,
  -- "Kantone der Schweiz", "Länder Europas", whatever the family is working
  -- through. Progress is counted per group, so two plans can run at once.
  group_name text not null default 'Ziele',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint fp_destinations_name_chk check (length(btrim(name)) between 1 and 80),
  constraint fp_destinations_code_chk check (code is null or length(btrim(code)) between 1 and 4),
  constraint fp_destinations_group_chk check (length(btrim(group_name)) between 1 and 60),
  unique (family_id, name)
);
create index if not exists fp_destinations_family_idx
  on public.fp_destinations (family_id, group_name, sort_order);

alter table public.fp_trips
  add column if not exists destination_id uuid references public.fp_destinations(id) on delete cascade;
alter table public.fp_trip_ideas
  add column if not exists destination_id uuid references public.fp_destinations(id) on delete cascade;

-- Carry across what is already there. Every canton a family has written a trip
-- or an idea for becomes one of its destinations, keeping the trips attached.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fp_trips' and column_name = 'canton'
  ) then
    with cantons(code, name, ord) as (values
      ('AG','Aargau',1), ('AR','Appenzell Ausserrhoden',2), ('AI','Appenzell Innerrhoden',3),
      ('BL','Basel-Landschaft',4), ('BS','Basel-Stadt',5), ('BE','Bern',6), ('FR','Freiburg',7),
      ('GE','Genf',8), ('GL','Glarus',9), ('GR','Graubünden',10), ('JU','Jura',11),
      ('LU','Luzern',12), ('NE','Neuenburg',13), ('NW','Nidwalden',14), ('OW','Obwalden',15),
      ('SG','St. Gallen',16), ('SH','Schaffhausen',17), ('SZ','Schwyz',18), ('SO','Solothurn',19),
      ('TI','Tessin',20), ('TG','Thurgau',21), ('UR','Uri',22), ('VD','Waadt',23),
      ('VS','Wallis',24), ('ZG','Zug',25), ('ZH','Zürich',26)
    ), used as (
      select family_id, canton from public.fp_trips
      union
      select family_id, canton from public.fp_trip_ideas
    )
    insert into public.fp_destinations (family_id, name, code, group_name, sort_order)
    select u.family_id, c.name, c.code, 'Kantone der Schweiz', c.ord
    from used u join cantons c on c.code = u.canton
    on conflict (family_id, name) do nothing;

    update public.fp_trips t
      set destination_id = d.id
      from public.fp_destinations d
      where d.family_id = t.family_id and d.code = t.canton and t.destination_id is null;

    update public.fp_trip_ideas i
      set destination_id = d.id
      from public.fp_destinations d
      where d.family_id = i.family_id and d.code = i.canton and i.destination_id is null;

    alter table public.fp_trips drop constraint if exists fp_trips_canton_check;
    alter table public.fp_trips drop column canton;
    alter table public.fp_trip_ideas drop column canton;
  end if;
end $$;

-- Only once everything that existed has been carried over.
alter table public.fp_trips alter column destination_id set not null;
alter table public.fp_trip_ideas alter column destination_id set not null;

create index if not exists fp_trips_destination_idx on public.fp_trips (destination_id);
create index if not exists fp_trip_ideas_destination_idx on public.fp_trip_ideas (destination_id);

alter table public.fp_destinations enable row level security;

drop policy if exists "fp members read destinations" on public.fp_destinations;
create policy "fp members read destinations" on public.fp_destinations for select
  using (public.fp_role_in(family_id) is not null);

drop policy if exists "fp editors write destinations" on public.fp_destinations;
create policy "fp editors write destinations" on public.fp_destinations for all
  using (public.fp_can_edit(family_id))
  with check (public.fp_can_edit(family_id));
