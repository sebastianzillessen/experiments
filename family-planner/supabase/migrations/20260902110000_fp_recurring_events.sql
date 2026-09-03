-- Recurring entries: one row describes the whole series.
--
-- Most of a week plan is the same every week ("Kita every Friday for Lars and
-- Miriam"). So the row carries its rule, and the frontend expands it for the
-- days on screen.
--
-- Only 'weekly' for now. The column is text, not a boolean, so 'daily',
-- 'monthly' and 'yearly' can follow without a shape change.
--
-- starts_at/ends_at still describe the FIRST date of the series. The time of
-- every later date is worked out in the client from the wall clock, so 14:00
-- stays 14:00 across a change of the clocks.

alter table public.fp_events
  add column if not exists repeat_freq text,
  add column if not exists repeat_interval int not null default 1,
  -- 0 = Sunday … 6 = Saturday, the same count as Date#getUTCDay() and ics.ts.
  add column if not exists repeat_weekdays smallint[] not null default '{}',
  add column if not exists repeat_until date;

alter table public.fp_events drop constraint if exists fp_events_repeat_chk;
alter table public.fp_events add constraint fp_events_repeat_chk check (
  (repeat_freq is null and repeat_weekdays = '{}' and repeat_until is null)
  or (
    repeat_freq = 'weekly'
    and array_length(repeat_weekdays, 1) between 1 and 7
    and repeat_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
    and repeat_interval between 1 and 12
    and (repeat_until is null or repeat_until >= start_date)
  )
);

-- One date dropped from a series ("that Friday is a holiday"). A *changed*
-- date is an exception plus a standalone entry, which keeps expanding free of
-- special cases.
create table if not exists public.fp_event_exceptions (
  event_id uuid not null references public.fp_events(id) on delete cascade,
  occurrence date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, occurrence)
);

alter table public.fp_event_exceptions enable row level security;

-- Rights follow the entry, exactly as for fp_event_people.
drop policy if exists "fp members read exceptions" on public.fp_event_exceptions;
create policy "fp members read exceptions" on public.fp_event_exceptions for select
  using (public.fp_role_in(public.fp_event_family(event_id)) is not null);

drop policy if exists "fp editors insert exceptions" on public.fp_event_exceptions;
create policy "fp editors insert exceptions" on public.fp_event_exceptions for insert
  with check (public.fp_can_edit(public.fp_event_family(event_id)));

drop policy if exists "fp editors delete exceptions" on public.fp_event_exceptions;
create policy "fp editors delete exceptions" on public.fp_event_exceptions for delete
  using (public.fp_can_edit(public.fp_event_family(event_id)));
