-- The household work: what keeps the house running, how often, how long, and
-- who did it.
--
-- Two tables, because they change on completely different clocks. A task is
-- described once and edited rarely — it is the family's own list of what
-- counts as work. A log is written several times a day, never edited except to
-- correct the minutes right after, and is the only thing the distribution is
-- ever computed from. Nothing is derived and stored: the rhythm on the task is
-- what the family *means* to do, the logs are what actually happened, and the
-- app shows both next to each other rather than quietly reconciling them.

-- Who takes on household work. Not every person in the planner does — the
-- children have columns in the week but do not empty the dishwasher — and the
-- buttons under a task are only useful while they are few.
alter table public.fp_people
  add column if not exists does_tasks boolean not null default false;

create table if not exists public.fp_tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.fp_families(id) on delete cascade,
  name text not null,
  -- Free text. The screen offers the areas this family already uses plus a
  -- few common ones, so the list of areas grows in the database with the
  -- household — a constraint here would mean a migration every time someone
  -- finds a new corner of their own life (a flat with an Airbnb in it, say).
  area text not null default 'haushalt',
  -- One of three rhythms, each in its own columns rather than a blob: the
  -- catalog is queried and checked by the database, not by whoever reads the
  -- JSON next. fp_tasks_rhythm_chk keeps exactly the columns of the chosen
  -- kind filled, so a "takt" row cannot carry a half-written interval.
  rhythm_kind text not null default 'takt'
    check (rhythm_kind in ('takt', 'intervall', 'ereignis', 'termine')),
  -- takt: 2-3 times per tag | woche | monat
  per_count_min smallint,
  per_count_max smallint,
  per_unit text check (per_unit in ('tag', 'woche', 'monat')),
  -- intervall: every 6 wochen
  every_count smallint,
  every_unit text check (every_unit in ('tage', 'wochen', 'monate')),
  -- ereignis: "nach jedem Gast". Never due and never overdue; the estimate
  -- exists only so the job still counts toward the weekly load.
  trigger_label text,
  est_per_week numeric(5, 2),
  -- termine: no rhythm at all, the dates are in fp_task_dates. Some work
  -- arrives as a list someone sent — the cleaner's dates for the next two
  -- months — and pretending that is "every 11 days" loses the actual days.
  -- Minutes per run. The planning figure; what was measured lives in the logs.
  minutes int not null default 15 check (minutes between 1 and 600),
  -- Ask for the minutes on every log, for jobs that swing: hanging up bedding
  -- is five minutes, hanging up a load of children's clothes is twenty.
  ask_duration boolean not null default false,
  -- Every run counts for itself (each dog walk), rather than the task being
  -- ticked off once for the day.
  log_each boolean not null default false,
  -- The work is remembering and organising it, not doing it.
  coordination boolean not null default false,
  -- 1 = Monday … 7 = Sunday, empty when any day will do. Same count as
  -- fp_menu_people uses, extended over the weekend.
  weekdays smallint[] not null default '{}',
  -- Who normally does it; null means whoever gets to it first.
  owner_person_id uuid references public.fp_people(id) on delete set null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint fp_tasks_name_chk check (length(btrim(name)) between 1 and 120),
  constraint fp_tasks_weekdays_chk check (
    weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
  ),
  constraint fp_tasks_rhythm_chk check (
    case rhythm_kind
      when 'takt' then
        per_count_min is not null and per_count_max is not null and per_unit is not null
        and per_count_min >= 1 and per_count_max >= per_count_min
      when 'intervall' then
        every_count is not null and every_unit is not null and every_count >= 1
      when 'ereignis' then
        length(btrim(coalesce(trigger_label, ''))) > 0
        and est_per_week is not null and est_per_week >= 0
      else true
    end
  )
);
create index if not exists fp_tasks_family_idx
  on public.fp_tasks (family_id, active, sort_order);

-- The dates a task is planned for, when it has dates rather than a rhythm.
-- One row per day: a list that arrives by message is edited by adding and
-- removing single days, never by rewriting a rule.
create table if not exists public.fp_task_dates (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.fp_families(id) on delete cascade,
  task_id uuid not null references public.fp_tasks(id) on delete cascade,
  due_date date not null,
  -- What the line said, when it said more than the date ("Sonderwunsch").
  note text,
  created_at timestamptz not null default now(),
  unique (task_id, due_date)
);
create index if not exists fp_task_dates_family_idx
  on public.fp_task_dates (family_id, due_date);

-- One run of one task. family_id is carried along rather than reached through
-- the task, so the distribution over four weeks is one indexed read.
create table if not exists public.fp_task_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.fp_families(id) on delete cascade,
  task_id uuid not null references public.fp_tasks(id) on delete cascade,
  -- The person it counts for, which is not always whoever tapped the button:
  -- one of them logs the other's dog walk often enough.
  person_id uuid references public.fp_people(id) on delete set null,
  done_at timestamptz not null default now(),
  minutes int not null check (minutes between 1 and 1440),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists fp_task_logs_family_idx
  on public.fp_task_logs (family_id, done_at desc);
create index if not exists fp_task_logs_task_idx
  on public.fp_task_logs (task_id, done_at desc);

alter table public.fp_tasks enable row level security;
alter table public.fp_task_dates enable row level security;
alter table public.fp_task_logs enable row level security;

-- Reading is for every member: seeing how the work is split is the point of
-- the feature, and a viewer who cannot see it learns nothing.
drop policy if exists "fp members read tasks" on public.fp_tasks;
create policy "fp members read tasks" on public.fp_tasks for select
  using (public.fp_role_in(family_id) is not null);

drop policy if exists "fp members read task dates" on public.fp_task_dates;
create policy "fp members read task dates" on public.fp_task_dates for select
  using (public.fp_role_in(family_id) is not null);

drop policy if exists "fp members read task logs" on public.fp_task_logs;
create policy "fp members read task logs" on public.fp_task_logs for select
  using (public.fp_role_in(family_id) is not null);

-- Writing is ordinary planning, so editors may. Logging in particular has to
-- be as cheap as ticking a box, or it stops happening and the numbers rot.
drop policy if exists "fp editors write tasks" on public.fp_tasks;
create policy "fp editors write tasks" on public.fp_tasks for all
  using (public.fp_can_edit(family_id))
  with check (public.fp_can_edit(family_id));

drop policy if exists "fp editors write task dates" on public.fp_task_dates;
create policy "fp editors write task dates" on public.fp_task_dates for all
  using (public.fp_can_edit(family_id))
  with check (public.fp_can_edit(family_id));

drop policy if exists "fp editors write task logs" on public.fp_task_logs;
create policy "fp editors write task logs" on public.fp_task_logs for all
  using (public.fp_can_edit(family_id))
  with check (public.fp_can_edit(family_id));
