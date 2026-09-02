-- =========================================================================
-- Familienplaner — schema, roles and row level security.
--
-- Lives in the SAME Supabase project as Salärli (kinderbetreuung-lohn) so
-- both apps share auth users, magic links and password logins. Everything
-- owned by this app is prefixed `fp_` and is completely independent of the
-- Salärli tables: a user can be a member of a family without being a member
-- of a household and vice versa.
--
-- Roles are deliberately DIFFERENT from Salärli's owner/admin/employee:
--   owner  — everything, including calendar connections (incl. credentials),
--            invites and removing people.
--   editor — plans: create/edit/delete entries and family members.
--   viewer — read-only. A family can have many viewers (grandparents, a
--            nanny, older kids) who see the plan but never change it.
-- =========================================================================

-- =========================================================================
-- TYPES
-- =========================================================================

do $$ begin
  create type public.fp_role as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fp_calendar_kind as enum ('ics', 'office365');
exception when duplicate_object then null; end $$;

-- =========================================================================
-- TABLES
-- =========================================================================

create table if not exists public.fp_families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- All-day boundaries and "which day is this event on" are resolved in this
  -- zone, both in the UI and when the calendar sync expands events.
  timezone text not null default 'Europe/Zurich',
  -- 1 = Monday. The paper planner this replaces starts the week on Monday.
  week_start smallint not null default 1 check (week_start between 0 and 6),
  created_at timestamptz not null default now()
);

create table if not exists public.fp_memberships (
  family_id uuid not null references public.fp_families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.fp_role not null,
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

-- The people the plan has columns for. Not the same thing as logins: a
-- toddler has a column but no account, a grandparent may have an account
-- (viewer) but no column.
create table if not exists public.fp_people (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.fp_families(id) on delete cascade,
  name text not null,
  -- Column header on narrow screens ("Basti" → "Ba"). Optional.
  short_name text,
  color text not null default '#2f6f5e',
  sort_order int not null default 0,
  -- Extra spellings that mark a calendar event as belonging to this person
  -- ("Lars", "Lasse", "L."). The person's own name always matches.
  aliases text[] not null default '{}',
  -- Optional link to a login, so "my entries" can be highlighted later.
  user_id uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists fp_people_family_idx on public.fp_people (family_id, sort_order);

-- Manually planned entries. All-day entries use start_date/end_date (end
-- inclusive, as a human reads a planner); timed entries additionally carry
-- starts_at/ends_at.
create table if not exists public.fp_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.fp_families(id) on delete cascade,
  title text not null,
  notes text not null default '',
  all_day boolean not null default true,
  start_date date not null,
  end_date date not null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fp_events_range_chk check (end_date >= start_date),
  constraint fp_events_times_chk check (
    (all_day and starts_at is null and ends_at is null)
    or (not all_day and starts_at is not null and ends_at is not null and ends_at >= starts_at)
  )
);
create index if not exists fp_events_family_range_idx
  on public.fp_events (family_id, start_date, end_date);

-- An entry can belong to several people ("Kids zu Oma") or to nobody, in
-- which case it is shown in the shared "Familie" column.
create table if not exists public.fp_event_people (
  event_id uuid not null references public.fp_events(id) on delete cascade,
  person_id uuid not null references public.fp_people(id) on delete cascade,
  primary key (event_id, person_id)
);

-- A connected calendar. The URL and any credentials live in
-- fp_calendar_secrets, which no client role can read.
create table if not exists public.fp_calendars (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.fp_families(id) on delete cascade,
  label text not null,
  kind public.fp_calendar_kind not null default 'ics',
  color text not null default '#8a7d64',
  enabled boolean not null default true,
  -- Redacted display form of the URL ("calendar.google.com/…/basic.ics") so
  -- the settings screen can show which feed is connected without handing the
  -- secret ICS link to every member.
  url_preview text not null default '',
  -- How long a cached fetch is considered fresh.
  ttl_minutes int not null default 30 check (ttl_minutes between 5 and 1440),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists fp_calendars_family_idx on public.fp_calendars (family_id);

-- Secrets. RLS is enabled and NO policy is defined on purpose: anon and
-- authenticated therefore have no access at all. Only the service role (the
-- family-calendar-sync Edge Function) and the security-definer RPCs below
-- ever touch this table.
create table if not exists public.fp_calendar_secrets (
  calendar_id uuid primary key references public.fp_calendars(id) on delete cascade,
  url text not null,
  username text,
  password text,
  updated_at timestamptz not null default now()
);

-- One cached fetch per calendar: the expanded event window as JSON. Written
-- by the Edge Function (service role), read by every family member.
create table if not exists public.fp_calendar_cache (
  calendar_id uuid primary key references public.fp_calendars(id) on delete cascade,
  family_id uuid not null references public.fp_families(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  window_from date not null,
  window_to date not null,
  etag text,
  event_count int not null default 0,
  events jsonb not null default '[]'::jsonb
);
create index if not exists fp_calendar_cache_family_idx on public.fp_calendar_cache (family_id);

-- Manual corrections on top of the automatic name matching for a calendar
-- event: pin it to different people, or hide it from the plan entirely.
create table if not exists public.fp_calendar_assignments (
  family_id uuid not null references public.fp_families(id) on delete cascade,
  calendar_id uuid not null references public.fp_calendars(id) on delete cascade,
  -- iCalendar UID plus the start date of the occurrence it applies to.
  uid text not null,
  -- '-infinity' means "the whole series", any other date one occurrence. A
  -- sentinel rather than NULL because these three columns are the primary key
  -- (and the conflict target of the client's upsert), and a key column cannot
  -- be null. The frontend maps '-infinity' to null and back.
  occurrence date not null default '-infinity',
  person_ids uuid[] not null default '{}',
  hidden boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (calendar_id, uid, occurrence)
);

create table if not exists public.fp_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.fp_families(id) on delete cascade,
  role public.fp_role not null,
  email text,
  token text,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint fp_invites_email_or_token_chk check (email is not null or token is not null)
);
create unique index if not exists fp_invites_token_uidx
  on public.fp_invites (token) where token is not null;
create unique index if not exists fp_invites_open_email_uidx
  on public.fp_invites (family_id, lower(email)) where email is not null and accepted_at is null;

-- =========================================================================
-- HELPERS
-- =========================================================================

-- Security definer so policies can ask "what is my role here?" without the
-- membership policy recursing into itself.
create or replace function public.fp_role_in(f uuid)
returns public.fp_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.fp_memberships
  where family_id = f and user_id = auth.uid()
$$;

create or replace function public.fp_can_edit(f uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fp_role_in(f) in ('owner', 'editor')
$$;

create or replace function public.fp_event_family(e uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.fp_events where id = e
$$;

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

alter table public.fp_families             enable row level security;
alter table public.fp_memberships          enable row level security;
alter table public.fp_people               enable row level security;
alter table public.fp_events               enable row level security;
alter table public.fp_event_people         enable row level security;
alter table public.fp_calendars            enable row level security;
alter table public.fp_calendar_secrets     enable row level security;
alter table public.fp_calendar_cache       enable row level security;
alter table public.fp_calendar_assignments enable row level security;
alter table public.fp_invites              enable row level security;

-- families
drop policy if exists "fp members read family" on public.fp_families;
create policy "fp members read family" on public.fp_families for select
  using (public.fp_role_in(id) is not null);

drop policy if exists "fp owner updates family" on public.fp_families;
create policy "fp owner updates family" on public.fp_families for update
  using (public.fp_role_in(id) = 'owner');

-- memberships
drop policy if exists "fp members read memberships" on public.fp_memberships;
create policy "fp members read memberships" on public.fp_memberships for select
  using (public.fp_role_in(family_id) is not null);

drop policy if exists "fp owner writes memberships" on public.fp_memberships;
create policy "fp owner writes memberships" on public.fp_memberships for insert
  with check (public.fp_role_in(family_id) = 'owner');

drop policy if exists "fp owner updates memberships" on public.fp_memberships;
create policy "fp owner updates memberships" on public.fp_memberships for update
  using (public.fp_role_in(family_id) = 'owner');

-- An owner can remove anyone; anyone can remove themselves (leave a family).
drop policy if exists "fp owner or self deletes membership" on public.fp_memberships;
create policy "fp owner or self deletes membership" on public.fp_memberships for delete
  using (public.fp_role_in(family_id) = 'owner' or user_id = auth.uid());

-- people
drop policy if exists "fp members read people" on public.fp_people;
create policy "fp members read people" on public.fp_people for select
  using (public.fp_role_in(family_id) is not null);

drop policy if exists "fp editors insert people" on public.fp_people;
create policy "fp editors insert people" on public.fp_people for insert
  with check (public.fp_can_edit(family_id));

drop policy if exists "fp editors update people" on public.fp_people;
create policy "fp editors update people" on public.fp_people for update
  using (public.fp_can_edit(family_id));

drop policy if exists "fp editors delete people" on public.fp_people;
create policy "fp editors delete people" on public.fp_people for delete
  using (public.fp_can_edit(family_id));

-- events
drop policy if exists "fp members read events" on public.fp_events;
create policy "fp members read events" on public.fp_events for select
  using (public.fp_role_in(family_id) is not null);

drop policy if exists "fp editors insert events" on public.fp_events;
create policy "fp editors insert events" on public.fp_events for insert
  with check (public.fp_can_edit(family_id) and created_by = auth.uid());

drop policy if exists "fp editors update events" on public.fp_events;
create policy "fp editors update events" on public.fp_events for update
  using (public.fp_can_edit(family_id));

drop policy if exists "fp editors delete events" on public.fp_events;
create policy "fp editors delete events" on public.fp_events for delete
  using (public.fp_can_edit(family_id));

-- event ↔ person links follow the event
drop policy if exists "fp members read event people" on public.fp_event_people;
create policy "fp members read event people" on public.fp_event_people for select
  using (public.fp_role_in(public.fp_event_family(event_id)) is not null);

drop policy if exists "fp editors insert event people" on public.fp_event_people;
create policy "fp editors insert event people" on public.fp_event_people for insert
  with check (public.fp_can_edit(public.fp_event_family(event_id)));

drop policy if exists "fp editors delete event people" on public.fp_event_people;
create policy "fp editors delete event people" on public.fp_event_people for delete
  using (public.fp_can_edit(public.fp_event_family(event_id)));

-- calendars: metadata is readable by every member (so the plan can colour and
-- label imported events), but only an owner may connect or disconnect one.
drop policy if exists "fp members read calendars" on public.fp_calendars;
create policy "fp members read calendars" on public.fp_calendars for select
  using (public.fp_role_in(family_id) is not null);

drop policy if exists "fp owner updates calendars" on public.fp_calendars;
create policy "fp owner updates calendars" on public.fp_calendars for update
  using (public.fp_role_in(family_id) = 'owner');

drop policy if exists "fp owner deletes calendars" on public.fp_calendars;
create policy "fp owner deletes calendars" on public.fp_calendars for delete
  using (public.fp_role_in(family_id) = 'owner');
-- No insert policy: calendars are created through fp_upsert_calendar(), which
-- writes the secret in the same transaction.

-- fp_calendar_secrets: intentionally no policies at all (service role only).

-- cache: readable by members, written only by the Edge Function.
drop policy if exists "fp members read cache" on public.fp_calendar_cache;
create policy "fp members read cache" on public.fp_calendar_cache for select
  using (public.fp_role_in(family_id) is not null);

-- assignments
drop policy if exists "fp members read assignments" on public.fp_calendar_assignments;
create policy "fp members read assignments" on public.fp_calendar_assignments for select
  using (public.fp_role_in(family_id) is not null);

drop policy if exists "fp editors insert assignments" on public.fp_calendar_assignments;
create policy "fp editors insert assignments" on public.fp_calendar_assignments for insert
  with check (public.fp_can_edit(family_id));

drop policy if exists "fp editors update assignments" on public.fp_calendar_assignments;
create policy "fp editors update assignments" on public.fp_calendar_assignments for update
  using (public.fp_can_edit(family_id));

drop policy if exists "fp editors delete assignments" on public.fp_calendar_assignments;
create policy "fp editors delete assignments" on public.fp_calendar_assignments for delete
  using (public.fp_can_edit(family_id));

-- invites
drop policy if exists "fp owner reads invites" on public.fp_invites;
create policy "fp owner reads invites" on public.fp_invites for select using (
  public.fp_role_in(family_id) = 'owner'
  or (email is not null and lower(email) = lower((select u.email from auth.users u where u.id = auth.uid())))
);

drop policy if exists "fp owner inserts invites" on public.fp_invites;
create policy "fp owner inserts invites" on public.fp_invites for insert
  with check (public.fp_role_in(family_id) = 'owner' and invited_by = auth.uid());

drop policy if exists "fp owner deletes invites" on public.fp_invites;
create policy "fp owner deletes invites" on public.fp_invites for delete
  using (public.fp_role_in(family_id) = 'owner');

-- =========================================================================
-- VIEW: memberships with the login's email (members screen)
-- =========================================================================

create or replace view public.fp_membership_users
with (security_invoker = true)
as
  select m.family_id,
         m.user_id,
         m.role,
         m.created_at,
         u.email,
         u.raw_user_meta_data->>'full_name' as full_name
  from public.fp_memberships m
  join auth.users u on u.id = m.user_id;

-- =========================================================================
-- RPCs
-- =========================================================================

-- Bootstrap: a signed-in user without a family creates one and becomes its
-- owner. Deliberately NOT an auth.users trigger — signing up for Salärli must
-- not create an empty family, and vice versa.
create or replace function public.fp_create_family(p_name text, p_people text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_clean_name text;
  v_person text;
  v_i int := 0;
  v_palette text[] := array['#2f6f5e', '#a8552f', '#3b5f9e', '#8a4a86', '#6b7a2f', '#b0813a'];
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_clean_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_clean_name is null then
    raise exception 'Name required';
  end if;

  insert into public.fp_families (name) values (v_clean_name) returning id into v_family_id;
  insert into public.fp_memberships (family_id, user_id, role)
    values (v_family_id, v_user_id, 'owner');

  foreach v_person in array coalesce(p_people, '{}') loop
    if nullif(btrim(v_person), '') is not null then
      insert into public.fp_people (family_id, name, color, sort_order)
        values (v_family_id, btrim(v_person), v_palette[(v_i % array_length(v_palette, 1)) + 1], v_i);
      v_i := v_i + 1;
    end if;
  end loop;

  return v_family_id;
end;
$$;

revoke all on function public.fp_create_family(text, text[]) from public;
grant execute on function public.fp_create_family(text, text[]) to authenticated;

-- Connect or update a calendar. Security definer because the URL and the
-- credentials go into fp_calendar_secrets, which is closed to clients.
create or replace function public.fp_upsert_calendar(
  p_family_id uuid,
  p_label text,
  p_url text,
  p_username text default null,
  p_password text default null,
  p_color text default '#8a7d64',
  p_enabled boolean default true,
  p_calendar_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calendar_id uuid := p_calendar_id;
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
  v_preview text;
  v_existing_url text;
begin
  if public.fp_role_in(p_family_id) is distinct from 'owner' then
    raise exception 'Only the family owner can manage calendars' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_label, '')), '') is null then
    raise exception 'Label required';
  end if;

  if v_calendar_id is not null then
    select s.url into v_existing_url
    from public.fp_calendar_secrets s
    join public.fp_calendars c on c.id = s.calendar_id
    where s.calendar_id = v_calendar_id and c.family_id = p_family_id;
    if not found then
      raise exception 'Calendar not found in this family';
    end if;
  end if;

  -- An empty URL on an update means "keep the stored one" (the UI never gets
  -- the secret back, so it cannot resend it).
  v_url := coalesce(v_url, v_existing_url);
  if v_url is null then
    raise exception 'Calendar URL required';
  end if;

  -- Host plus a shortened path, enough to recognise the feed, not enough to
  -- subscribe to it.
  v_preview := regexp_replace(v_url, '^[a-zA-Z]+://', '');
  v_preview := split_part(v_preview, '/', 1) || '/…/' || right(split_part(v_preview, '?', 1), 12);

  if v_calendar_id is null then
    insert into public.fp_calendars (family_id, label, color, enabled, url_preview)
      values (p_family_id, btrim(p_label), p_color, p_enabled, v_preview)
      returning id into v_calendar_id;
  else
    update public.fp_calendars
      set label = btrim(p_label), color = p_color, enabled = p_enabled,
          url_preview = v_preview, last_error = null
      where id = v_calendar_id and family_id = p_family_id;
  end if;

  insert into public.fp_calendar_secrets (calendar_id, url, username, password)
    values (v_calendar_id, v_url, nullif(btrim(coalesce(p_username, '')), ''), nullif(p_password, ''))
    on conflict (calendar_id) do update
      set url = excluded.url,
          -- Blank username/password on an update keeps what is stored.
          username = coalesce(excluded.username, public.fp_calendar_secrets.username),
          password = coalesce(excluded.password, public.fp_calendar_secrets.password),
          updated_at = now();

  return v_calendar_id;
end;
$$;

revoke all on function public.fp_upsert_calendar(uuid, text, text, text, text, text, boolean, uuid) from public;
grant execute on function public.fp_upsert_calendar(uuid, text, text, text, text, text, boolean, uuid) to authenticated;

-- Invite by link: the owner mints a token, the link (…?invite=<token>) is
-- shared out of band. Mirrors Salärli's link invites, with fp roles.
create or replace function public.fp_create_link_invite(p_family_id uuid, p_role public.fp_role)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if public.fp_role_in(p_family_id) is distinct from 'owner' then
    raise exception 'Only the family owner can invite' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'Invite role must be editor or viewer';
  end if;

  v_token := replace(replace(replace(
    encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '');

  insert into public.fp_invites (family_id, role, token, invited_by)
    values (p_family_id, p_role, v_token, auth.uid());

  return v_token;
end;
$$;

revoke all on function public.fp_create_link_invite(uuid, public.fp_role) from public;
grant execute on function public.fp_create_link_invite(uuid, public.fp_role) to authenticated;

-- Callable before sign-in so the login screen can greet an invitee with the
-- family name. Only ever discloses the name of a family whose secret token
-- the caller already holds.
create or replace function public.fp_invite_info(p_token text)
returns table (family_name text, role public.fp_role)
language sql
stable
security definer
set search_path = public
as $$
  select f.name, i.role
  from public.fp_invites i
  join public.fp_families f on f.id = i.family_id
  where i.token = p_token and i.token is not null and i.accepted_at is null
$$;

revoke all on function public.fp_invite_info(text) from public;
grant execute on function public.fp_invite_info(text) to anon, authenticated;

create or replace function public.fp_accept_invite_by_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.fp_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from public.fp_invites
  where token = p_token and token is not null and accepted_at is null
  limit 1;

  if v_invite.id is null then
    return null;
  end if;

  insert into public.fp_memberships (family_id, user_id, role)
    values (v_invite.family_id, auth.uid(), v_invite.role)
    on conflict (family_id, user_id) do nothing;

  update public.fp_invites set accepted_at = now() where id = v_invite.id;
  return v_invite.family_id;
end;
$$;

revoke all on function public.fp_accept_invite_by_token(text) from public;
grant execute on function public.fp_accept_invite_by_token(text) to authenticated;

-- Email invite acceptance: the invited address signs in (magic link) and
-- claims the invite itself.
create or replace function public.fp_accept_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invite public.fp_invites%rowtype;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from public.fp_invites
  where id = p_invite_id and email is not null
    and lower(email) = lower(v_email) and accepted_at is null;

  if v_invite.id is null then
    raise exception 'Invite not found, already accepted, or email mismatch';
  end if;

  insert into public.fp_memberships (family_id, user_id, role)
    values (v_invite.family_id, auth.uid(), v_invite.role)
    on conflict (family_id, user_id) do nothing;

  update public.fp_invites set accepted_at = now() where id = v_invite.id;
  return v_invite.family_id;
end;
$$;

revoke all on function public.fp_accept_invite(uuid) from public;
grant execute on function public.fp_accept_invite(uuid) to authenticated;

-- Disconnect a calendar: metadata, secret and cache go together.
create or replace function public.fp_delete_calendar(p_calendar_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  select family_id into v_family_id from public.fp_calendars where id = p_calendar_id;
  if v_family_id is null then
    return;
  end if;
  if public.fp_role_in(v_family_id) is distinct from 'owner' then
    raise exception 'Only the family owner can manage calendars' using errcode = '42501';
  end if;
  -- fp_calendar_secrets / fp_calendar_cache cascade from fp_calendars.
  delete from public.fp_calendars where id = p_calendar_id;
end;
$$;

revoke all on function public.fp_delete_calendar(uuid) from public;
grant execute on function public.fp_delete_calendar(uuid) to authenticated;

-- =========================================================================
-- TRIGGERS
-- =========================================================================

create or replace function public.fp_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fp_events_touch_updated_at on public.fp_events;
create trigger fp_events_touch_updated_at
  before update on public.fp_events
  for each row execute function public.fp_touch_updated_at();
