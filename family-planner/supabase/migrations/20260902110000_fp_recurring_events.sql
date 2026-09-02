-- Wiederkehrende Einträge: eine Zeile beschreibt die ganze Serie.
--
-- Der Wochenplan besteht zum grössten Teil aus Dingen, die jede Woche gleich
-- sind ("Kita jeden Freitag für Lars und Miriam"). Statt 40 Zeilen pro Schuljahr
-- trägt die Serie ihre Regel selbst; aufgelöst wird sie im Frontend, immer nur
-- für den sichtbaren Zeitraum.
--
-- Nur 'weekly' — das deckt einen Familienplan ab. Die Spalte ist als Text
-- angelegt (nicht als Boolean), damit 'daily'/'monthly'/'yearly' später ohne
-- Formänderung dazukommen können.
--
-- starts_at/ends_at beschreiben weiterhin den ERSTEN Termin der Serie; die
-- Uhrzeit jeder weiteren Wiederholung wird im Client aus der Wandzeit neu
-- berechnet, damit 14:00 auch über die Zeitumstellung hinweg 14:00 bleibt.

alter table public.fp_events
  add column if not exists repeat_freq text,
  add column if not exists repeat_interval int not null default 1,
  -- 0 = Sonntag … 6 = Samstag, dieselbe Zählung wie Date#getUTCDay() und ics.ts.
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

-- Ein einzeln entfernter Termin einer Serie ("an dem Freitag ist Feiertag").
-- Ein einzeln *geänderter* Termin ist eine Ausnahme plus ein eigenständiger
-- Einzeleintrag — so bleibt die Auflösung frei von Sonderfällen.
create table if not exists public.fp_event_exceptions (
  event_id uuid not null references public.fp_events(id) on delete cascade,
  occurrence date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, occurrence)
);

alter table public.fp_event_exceptions enable row level security;

-- Rechte folgen dem Termin, exakt wie bei fp_event_people.
drop policy if exists "fp members read exceptions" on public.fp_event_exceptions;
create policy "fp members read exceptions" on public.fp_event_exceptions for select
  using (public.fp_role_in(public.fp_event_family(event_id)) is not null);

drop policy if exists "fp editors insert exceptions" on public.fp_event_exceptions;
create policy "fp editors insert exceptions" on public.fp_event_exceptions for insert
  with check (public.fp_can_edit(public.fp_event_family(event_id)));

drop policy if exists "fp editors delete exceptions" on public.fp_event_exceptions;
create policy "fp editors delete exceptions" on public.fp_event_exceptions for delete
  using (public.fp_can_edit(public.fp_event_family(event_id)));
