/* eslint-disable react-refresh/only-export-components */
// Auth flow + data layer. The auth half mirrors Salärli's AppContext (the same
// magic-link/password/invite handling against the same Supabase project); the
// data half is the planner's own: family, people, entries, calendars.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, hadAuthErrorInUrl, getPendingInviteToken, clearPendingInviteToken } from '../supabaseClient.ts';
import { localToIso } from '../lib/dates.ts';
import { calendarEventsToPlanner } from '../lib/merge.ts';
import { menuEventsToPlanner } from '../lib/menuPlan.ts';
import type { ManualSeries, RepeatRule } from '../lib/recurrence.ts';
import type { CalendarCacheEntry } from '../lib/merge.ts';
import type {
  Assignment, Calendar, CachedEvent, Family, HouseholdTask, Member, MenuAssignment, MenuSource,
  MenuWeek, OpenInvite, Person, PlannerEvent, Role, TaskDate, TaskLog, TaskRhythm, TimeFormat,
  Trip, TripIdea, WeatherDay,
} from '../lib/types.ts';
import { STARTER_TASKS } from '../lib/tasks.ts';
import type { TaskDraft } from '../lib/tasks.ts';

const NEUTRAL_COLOR = '#6b7280';
// fp_calendar_assignments.occurrence uses this instead of NULL for an override
// that applies to a whole series — a primary-key column cannot be null.
const SERIES_WIDE = '-infinity';
// The distribution looks at four weeks; a little more is kept so a month can
// be paged back through without another round trip.
const TASK_LOG_DAYS = 120;
const LOGIN_LINK_WARNING = 'Dein Anmelde-Link war ungültig oder ist abgelaufen. Bitte fordere unten einen neuen Link an.';

export type Screen = 'loading' | 'login' | 'create-family' | 'app';

export type SyncState = { busy: boolean; message: string | null; error: string | null };

export type NewEventInput = {
  title: string;
  notes: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  /** "HH:MM" in the family's zone; only used when allDay is false. */
  startTime?: string;
  endTime?: string;
  personIds: string[];
  /** null = one-off. */
  repeat?: RepeatRule | null;
};

export type NewTripInput = {
  canton: string;
  title: string;
  notes: string;
  fromDate: string | null;
  toDate: string | null;
  done: boolean;
  doneOn: string | null;
  source: 'eigen' | 'idee';
};

/**
 * Does a change to a series touch only this one date, or all of them?
 */
export type EditScope = 'occurrence' | 'series';

type AppContextValue = {
  screen: Screen;
  user: User | null;
  family: Family | null;
  role: Role | null;
  canEdit: boolean;
  isOwner: boolean;
  people: Person[];
  calendars: Calendar[];
  /** Own entries, still as a series. The planner expands them per view. */
  manualSeries: ManualSeries[];
  /** Events from the connected calendars, already expanded. */
  calendarEvents: PlannerEvent[];
  /** The daytime forecast per day, empty until a postal code is set. */
  weather: WeatherDay[];
  /** When it was last fetched, so the settings can say whether it ever was. */
  weatherFetchedAt: string | null;
  menuSources: MenuSource[];
  menuWeeks: MenuWeek[];
  menuAssignments: MenuAssignment[];
  /** Imported lunches, already narrowed to the children who eat them. */
  menuEvents: PlannerEvent[];
  /** The household catalog: what counts as work in this family. */
  tasks: HouseholdTask[];
  /** Every run of every task in the last few months, newest first. */
  taskLogs: TaskLog[];
  /** Trips to the cantons: planned, done, or just named. */
  trips: Trip[];
  /** The suggestions last fetched, per canton. */
  tripIdeas: TripIdea[];
  members: Member[];
  openInvites: OpenInvite[];
  sync: SyncState;
  authError: string | null;
  setAuthError: (msg: string | null) => void;
  loginWarning: string | null;
  setLoginWarning: (msg: string | null) => void;
  inviteToken: string | null;

  /** Resolves to null on success, or the error message to show. */
  createFamily: (name: string, people: string[]) => Promise<string | null>;
  addEvent: (input: NewEventInput) => Promise<boolean>;
  updateEvent: (id: string, input: NewEventInput, scope: EditScope, occurrence: string | null) => Promise<boolean>;
  deleteEvent: (id: string, scope: EditScope, occurrence: string | null) => Promise<boolean>;
  addPerson: (name: string) => Promise<boolean>;
  updatePerson: (id: string, patch: Partial<Pick<Person, 'name' | 'shortName' | 'color' | 'aliases' | 'sortOrder' | 'doesTasks'>>) => Promise<boolean>;
  deletePerson: (id: string) => Promise<boolean>;
  setAssignment: (event: PlannerEvent, personIds: string[], hidden: boolean) => Promise<boolean>;
  upsertCalendar: (input: { id?: string; label: string; url: string; username: string; password: string; color: string; enabled: boolean }) => Promise<boolean>;
  deleteCalendar: (id: string) => Promise<boolean>;
  refreshCalendars: (force: boolean) => Promise<void>;
  setWeatherPlz: (plz: string | null) => Promise<boolean>;
  refreshWeather: (force: boolean) => Promise<string | null>;
  upsertMenuSource: (input: { id?: string; label: string; baseUrl: string; pathPatterns: string[]; enabled: boolean }) => Promise<boolean>;
  deleteMenuSource: (id: string) => Promise<boolean>;
  setMenuAssignment: (sourceId: string, personId: string, weekdays: number[]) => Promise<boolean>;
  removeMenuAssignment: (sourceId: string, personId: string) => Promise<boolean>;
  importMenuWeek: (sourceId: string, year: number, week: number, pdfBase64?: string) => Promise<string | null>;
  deleteMenuWeek: (id: string) => Promise<boolean>;
  /** Resolves to the task's id, so a new one can be filled in right away. */
  upsertTask: (draft: TaskDraft, id?: string) => Promise<string | null>;
  /** Adds planned days to a task; days it already has are left alone. */
  addTaskDates: (taskId: string, dates: TaskDate[]) => Promise<boolean>;
  removeTaskDate: (taskId: string, date: string) => Promise<boolean>;
  deleteTask: (id: string) => Promise<boolean>;
  addStarterTasks: () => Promise<boolean>;
  /** Books one run. Resolves to the new log, or null when it failed. */
  logTask: (taskId: string, personId: string, minutes: number) => Promise<TaskLog | null>;
  setLogMinutes: (logId: string, minutes: number) => Promise<boolean>;
  deleteTaskLog: (logId: string) => Promise<boolean>;
  addTrip: (input: NewTripInput) => Promise<boolean>;
  updateTrip: (id: string, patch: Partial<NewTripInput> & { done?: boolean }) => Promise<boolean>;
  deleteTrip: (id: string) => Promise<boolean>;
  /** Asks the model for ideas. Resolves to null on success, or the message. */
  fetchTripIdeas: (canton: string, wishes: string, refresh: boolean) => Promise<string | null>;
  discardTripIdea: (id: string) => Promise<boolean>;
  setTimeFormat: (format: TimeFormat) => Promise<boolean>;
  createLinkInvite: (role: Role) => Promise<string | null>;
  updateMemberRole: (userId: string, role: Role) => Promise<boolean>;
  removeMember: (userId: string) => Promise<boolean>;
  reload: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside AppProvider');
  return ctx;
}

type ManualRow = {
  id: string;
  title: string;
  notes: string;
  all_day: boolean;
  start_date: string;
  end_date: string;
  starts_at: string | null;
  ends_at: string | null;
  repeat_freq: string | null;
  repeat_interval: number | null;
  repeat_weekdays: number[] | null;
  repeat_until: string | null;
  fp_event_people: { person_id: string }[] | null;
  fp_event_exceptions: { occurrence: string }[] | null;
};

type TaskRow = {
  id: string;
  name: string;
  area: string;
  rhythm_kind: string;
  per_count_min: number | null;
  per_count_max: number | null;
  per_unit: string | null;
  every_count: number | null;
  every_unit: string | null;
  trigger_label: string | null;
  /** numeric(5,2) arrives as a string often enough to always go through Number. */
  est_per_week: number | string | null;
  minutes: number;
  ask_duration: boolean;
  log_each: boolean;
  coordination: boolean;
  weekdays: number[] | null;
  owner_person_id: string | null;
  active: boolean;
  sort_order: number;
};

const TASK_COLUMNS = 'id, name, area, rhythm_kind, per_count_min, per_count_max, per_unit, '
  + 'every_count, every_unit, trigger_label, est_per_week, minutes, ask_duration, log_each, '
  + 'coordination, weekdays, owner_person_id, active, sort_order';

function rowToRhythm(row: TaskRow): TaskRhythm {
  if (row.rhythm_kind === 'intervall') {
    return {
      kind: 'intervall',
      every: row.every_count ?? 1,
      unit: (row.every_unit as 'tage' | 'wochen' | 'monate') ?? 'wochen',
    };
  }
  if (row.rhythm_kind === 'ereignis') {
    return {
      kind: 'ereignis',
      trigger: row.trigger_label ?? '',
      estPerWeek: Number(row.est_per_week ?? 1),
    };
  }
  return {
    kind: 'takt',
    min: row.per_count_min ?? 1,
    max: row.per_count_max ?? row.per_count_min ?? 1,
    per: (row.per_unit as 'tag' | 'woche' | 'monat') ?? 'woche',
  };
}

const rowToTask = (row: TaskRow, dates: TaskDate[] = []): HouseholdTask => ({
  dates,
  id: row.id,
  name: row.name,
  area: row.area,
  rhythm: rowToRhythm(row),
  minutes: row.minutes,
  askDuration: row.ask_duration,
  logEach: row.log_each,
  coordination: row.coordination,
  weekdays: row.weekdays ?? [],
  ownerPersonId: row.owner_person_id,
  active: row.active,
  sortOrder: row.sort_order,
});

/**
 * The other direction: only the columns of the chosen rhythm are filled, the
 * rest are cleared. Leaving a stale interval behind on a task that is now a
 * daily one is exactly what fp_tasks_rhythm_chk refuses.
 */
function taskToRow(draft: TaskDraft, familyId: string): Record<string, unknown> {
  const r = draft.rhythm;
  return {
    family_id: familyId,
    name: draft.name.trim(),
    area: draft.area.trim() || 'haushalt',
    minutes: draft.minutes,
    ask_duration: draft.askDuration,
    log_each: draft.logEach,
    coordination: draft.coordination,
    weekdays: draft.weekdays,
    owner_person_id: draft.ownerPersonId,
    active: draft.active,
    rhythm_kind: r.kind,
    per_count_min: r.kind === 'takt' ? r.min : null,
    per_count_max: r.kind === 'takt' ? Math.max(r.min, r.max) : null,
    per_unit: r.kind === 'takt' ? r.per : null,
    every_count: r.kind === 'intervall' ? r.every : null,
    every_unit: r.kind === 'intervall' ? r.unit : null,
    trigger_label: r.kind === 'ereignis' ? r.trigger.trim() : null,
    est_per_week: r.kind === 'ereignis' ? r.estPerWeek : null,
  };
}

const rowToTrip = (row: Record<string, unknown>): Trip => ({
  id: row.id as string,
  canton: row.canton as string,
  title: row.title as string,
  notes: (row.notes as string) ?? '',
  fromDate: (row.from_date as string) ?? null,
  toDate: (row.to_date as string) ?? null,
  done: Boolean(row.done),
  doneOn: (row.done_on as string) ?? null,
  source: row.source === 'idee' ? 'idee' : 'eigen',
});

const tripToRow = (input: NewTripInput) => ({
  canton: input.canton,
  title: input.title.trim(),
  notes: input.notes.trim(),
  from_date: input.fromDate,
  to_date: input.toDate,
  done: input.done,
  // Ticked off without ever having had a date: the day it was ticked is the
  // best answer available, and an empty "when" reads like a mistake.
  done_on: input.done ? (input.doneOn ?? input.fromDate ?? new Date().toISOString().slice(0, 10)) : null,
  source: input.source,
});

const rowToIdea = (row: Record<string, unknown>): TripIdea => ({
  id: row.id as string,
  canton: row.canton as string,
  title: row.title as string,
  summary: (row.summary as string) ?? '',
  highlights: (row.highlights as string[]) ?? [],
  duration: row.duration === 'zwei-tage' ? 'zwei-tage' : 'tag',
  season: (row.season as string) ?? '',
  travel: (row.travel as string) ?? '',
  wishes: (row.wishes as string) ?? '',
  generatedAt: (row.generated_at as string) ?? '',
});

const rowToLog = (row: Record<string, unknown>): TaskLog => ({
  id: row.id as string,
  taskId: row.task_id as string,
  personId: (row.person_id as string) ?? null,
  doneAt: row.done_at as string,
  minutes: row.minutes as number,
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [manualSeries, setManualSeries] = useState<ManualSeries[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [caches, setCaches] = useState<CalendarCacheEntry[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [weather, setWeather] = useState<WeatherDay[]>([]);
  const [weatherFetchedAt, setWeatherFetchedAt] = useState<string | null>(null);
  const [menuSources, setMenuSources] = useState<MenuSource[]>([]);
  const [menuWeeks, setMenuWeeks] = useState<MenuWeek[]>([]);
  const [menuAssignments, setMenuAssignments] = useState<MenuAssignment[]>([]);
  const [tasks, setTasks] = useState<HouseholdTask[]>([]);
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripIdeas, setTripIdeas] = useState<TripIdea[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [openInvites, setOpenInvites] = useState<OpenInvite[]>([]);
  const [sync, setSync] = useState<SyncState>({ busy: false, message: null, error: null });
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginWarning, setLoginWarning] = useState<string | null>(null);

  const userRef = useRef<User | null>(null);
  const familyRef = useRef<Family | null>(null);
  const roleRef = useRef<Role | null>(null);
  userRef.current = user;
  familyRef.current = family;
  roleRef.current = role;

  const canEdit = role === 'owner' || role === 'editor';
  const isOwner = role === 'owner';
  const inviteToken = getPendingInviteToken();

  /* ------------------------------------------------------------------ */
  /* Loading                                                             */
  /* ------------------------------------------------------------------ */

  const mapPeople = (rows: Record<string, unknown>[]): Person[] => rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    shortName: (r.short_name as string) ?? null,
    color: (r.color as string) || NEUTRAL_COLOR,
    sortOrder: (r.sort_order as number) ?? 0,
    aliases: (r.aliases as string[]) ?? [],
    userId: (r.user_id as string) ?? null,
    archivedAt: (r.archived_at as string) ?? null,
    doesTasks: Boolean(r.does_tasks),
  }));

  const manualToSeries = useCallback((rows: ManualRow[], peopleList: Person[]): ManualSeries[] => {
    const colorOf = (ids: string[]) => peopleList.find(p => p.id === ids[0])?.color ?? NEUTRAL_COLOR;
    return rows.map(row => {
      const personIds = (row.fp_event_people ?? []).map(l => l.person_id);
      return {
        id: row.id,
        title: row.title,
        notes: row.notes ?? '',
        allDay: row.all_day,
        startDate: row.start_date,
        endDate: row.end_date,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        personIds,
        color: colorOf(personIds),
        repeat: row.repeat_freq === 'weekly'
          ? {
              freq: 'weekly' as const,
              interval: row.repeat_interval ?? 1,
              weekdays: row.repeat_weekdays ?? [],
              until: row.repeat_until,
            }
          : null,
        exceptions: (row.fp_event_exceptions ?? []).map(e => e.occurrence),
      };
    });
  }, []);

  const loadFamilyData = useCallback(async (fam: Family, currentRole: Role) => {
    const logsSince = new Date(Date.now() - TASK_LOG_DAYS * 86_400_000).toISOString();
    const [peopleRes, eventsRes, calendarsRes, cacheRes, assignRes,
           menuSourceRes, menuWeekRes, menuPeopleRes, weatherRes,
           tasksRes, taskLogsRes, taskDatesRes, tripsRes, tripIdeasRes] = await Promise.all([
      supabase.from('fp_people').select('*').eq('family_id', fam.id).is('archived_at', null).order('sort_order'),
      supabase.from('fp_events')
        .select('id, title, notes, all_day, start_date, end_date, starts_at, ends_at, '
          + 'repeat_freq, repeat_interval, repeat_weekdays, repeat_until, '
          + 'fp_event_people(person_id), fp_event_exceptions(occurrence)')
        .eq('family_id', fam.id).order('start_date'),
      supabase.from('fp_calendars').select('*').eq('family_id', fam.id).order('created_at'),
      supabase.from('fp_calendar_cache').select('calendar_id, events').eq('family_id', fam.id),
      supabase.from('fp_calendar_assignments').select('calendar_id, uid, occurrence, person_ids, hidden').eq('family_id', fam.id),
      supabase.from('fp_menu_sources').select('*').eq('family_id', fam.id).order('created_at'),
      supabase.from('fp_menu_weeks')
        .select('id, source_id, year, week, from_date, to_date, imported_at, days')
        .eq('family_id', fam.id).order('from_date'),
      supabase.from('fp_menu_people').select('source_id, person_id, weekdays'),
      supabase.from('fp_weather_cache').select('days, plz, fetched_at').eq('family_id', fam.id).maybeSingle(),
      supabase.from('fp_tasks').select(TASK_COLUMNS).eq('family_id', fam.id).order('sort_order'),
      supabase.from('fp_task_logs').select('id, task_id, person_id, done_at, minutes')
        .eq('family_id', fam.id).gte('done_at', logsSince).order('done_at', { ascending: false }),
      supabase.from('fp_task_dates').select('task_id, due_date, note')
        .eq('family_id', fam.id).order('due_date'),
      supabase.from('fp_trips')
        .select('id, canton, title, notes, from_date, to_date, done, done_on, source')
        .eq('family_id', fam.id).order('created_at'),
      supabase.from('fp_trip_ideas')
        .select('id, canton, title, summary, highlights, duration, season, travel, wishes, generated_at')
        .eq('family_id', fam.id).order('generated_at'),
    ]);

    const nextPeople = mapPeople(peopleRes.data ?? []);
    setPeople(nextPeople);
    setManualSeries(manualToSeries((eventsRes.data ?? []) as unknown as ManualRow[], nextPeople));
    setCalendars((calendarsRes.data ?? []).map(c => ({
      id: c.id,
      label: c.label,
      kind: c.kind,
      color: c.color,
      enabled: c.enabled,
      urlPreview: c.url_preview ?? '',
      ttlMinutes: c.ttl_minutes ?? 15,
      lastSyncedAt: c.last_synced_at,
      lastError: c.last_error,
    })));
    setCaches((cacheRes.data ?? []).map(row => ({
      calendarId: row.calendar_id as string,
      events: (row.events ?? []) as CachedEvent[],
    })));
    setAssignments((assignRes.data ?? []).map(row => ({
      calendarId: row.calendar_id as string,
      uid: row.uid as string,
      // '-infinity' is the "whole series" sentinel (see the migration).
      occurrence: row.occurrence === SERIES_WIDE ? null : (row.occurrence as string) ?? null,
      personIds: (row.person_ids as string[]) ?? [],
      hidden: Boolean(row.hidden),
    })));

    // A postal code changed since the last fetch makes the cache another
    // town's weather, so it is not shown until the next refresh replaces it.
    const cachedWeather = weatherRes.data as
      { days?: WeatherDay[]; plz?: string; fetched_at?: string } | null;
    const weatherMatches = Boolean(cachedWeather && cachedWeather.plz === fam.weatherPlz);
    setWeather(weatherMatches ? (cachedWeather!.days ?? []) : []);
    setWeatherFetchedAt(weatherMatches ? (cachedWeather!.fetched_at ?? null) : null);

    setMenuSources((menuSourceRes.data ?? []).map(row => ({
      id: row.id as string,
      label: row.label as string,
      baseUrl: row.base_url as string,
      pathPatterns: (row.path_patterns as string[]) ?? [],
      enabled: Boolean(row.enabled),
    })));
    setMenuWeeks((menuWeekRes.data ?? []).map(row => ({
      id: row.id as string,
      sourceId: row.source_id as string,
      year: row.year as number,
      week: row.week as number,
      from: row.from_date as string,
      to: row.to_date as string,
      importedAt: (row.imported_at as string) ?? null,
      days: (row.days ?? []) as MenuWeek['days'],
    })));
    // fp_menu_people has no family_id of its own; RLS scopes it through the
    // source, so what comes back is already this family's.
    setMenuAssignments((menuPeopleRes.data ?? []).map(row => ({
      sourceId: row.source_id as string,
      personId: row.person_id as string,
      weekdays: (row.weekdays as number[]) ?? [],
    })));

    const datesByTask = new Map<string, TaskDate[]>();
    for (const row of taskDatesRes.data ?? []) {
      const list = datesByTask.get(row.task_id as string) ?? [];
      list.push({ date: row.due_date as string, note: (row.note as string) ?? null });
      datesByTask.set(row.task_id as string, list);
    }
    setTasks(((tasksRes.data ?? []) as unknown as TaskRow[])
      .map(row => rowToTask(row, datesByTask.get(row.id) ?? [])));
    setTaskLogs((taskLogsRes.data ?? []).map(rowToLog));

    setTrips((tripsRes.data ?? []).map(rowToTrip));
    setTripIdeas((tripIdeasRes.data ?? []).map(rowToIdea));

    if (currentRole === 'owner') {
      const [membersRes, invitesRes] = await Promise.all([
        supabase.from('fp_membership_users').select('user_id, email, full_name, role').eq('family_id', fam.id),
        supabase.from('fp_invites').select('id, role, email, token, created_at').eq('family_id', fam.id).is('accepted_at', null),
      ]);
      setMembers((membersRes.data ?? []).map(m => ({
        userId: m.user_id, email: m.email, fullName: m.full_name, role: m.role as Role,
      })));
      setOpenInvites((invitesRes.data ?? []).map(i => ({
        id: i.id, role: i.role as Role, email: i.email, token: i.token, createdAt: i.created_at,
      })));
    } else {
      setMembers([]);
      setOpenInvites([]);
    }
  }, [manualToSeries]);

  const onSignedIn = useCallback(async (u: User) => {
    userRef.current = u;
    setUser(u);

    // Consume a pending ?invite=<token> before resolving the membership, so an
    // invitee is already a member when we look them up.
    const token = getPendingInviteToken();
    if (token) {
      try {
        await supabase.rpc('fp_accept_invite_by_token', { p_token: token });
      } catch (e) {
        console.warn('[invite] fp_accept_invite_by_token failed:', e);
      }
      clearPendingInviteToken();
    }

    const { data: memberships, error } = await supabase
      .from('fp_memberships')
      .select('family_id, role, created_at')
      .eq('user_id', u.id)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) console.warn(error);

    const membership = memberships?.[0];
    if (!membership) {
      setScreen('create-family');
      return;
    }

    const { data: fam } = await supabase
      .from('fp_families')
      .select('id, name, timezone, week_start, time_format, weather_plz')
      .eq('id', membership.family_id)
      .maybeSingle();
    if (!fam) {
      setScreen('create-family');
      return;
    }

    const nextFamily: Family = {
      id: fam.id,
      name: fam.name,
      timezone: fam.timezone || 'Europe/Zurich',
      weekStart: fam.week_start ?? 1,
      timeFormat: fam.time_format === '12h' ? '12h' : '24h',
      weatherPlz: (fam.weather_plz as string | null) ?? null,
    };
    const nextRole = membership.role as Role;
    familyRef.current = nextFamily;
    roleRef.current = nextRole;
    setFamily(nextFamily);
    setRole(nextRole);
    await loadFamilyData(nextFamily, nextRole);
    setScreen('app');
  }, [loadFamilyData]);

  const reload = useCallback(async () => {
    const fam = familyRef.current;
    const currentRole = roleRef.current;
    if (fam && currentRole) await loadFamilyData(fam, currentRole);
  }, [loadFamilyData]);

  /* ------------------------------------------------------------------ */
  /* Auth bootstrap                                                      */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        onSignedIn(session.user);
      } else if (event === 'SIGNED_OUT') {
        userRef.current = null;
        familyRef.current = null;
        roleRef.current = null;
        setUser(null);
        setFamily(null);
        setRole(null);
        setPeople([]);
        setManualSeries([]);
        setWeather([]);
        setWeatherFetchedAt(null);
        setMenuSources([]);
        setMenuWeeks([]);
        setMenuAssignments([]);
        setCalendars([]);
        setCaches([]);
        setAssignments([]);
        setMembers([]);
        setOpenInvites([]);
        setScreen('login');
      }
    });

    (async function bootstrap() {
      // Magic links carry the OTP as ?token_hash=…&type=… and are verified
      // here in JS, so link prefetchers cannot burn the single-use token.
      const params = new URLSearchParams(location.search);
      const tokenHash = params.get('token_hash');
      const otpType = params.get('type');
      if (tokenHash && otpType) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType as 'magiclink' });
        history.replaceState(null, '', location.pathname);
        if (error) {
          setLoginWarning(LOGIN_LINK_WARNING);
          setScreen('login');
          return;
        }
      } else if (hadAuthErrorInUrl) {
        setLoginWarning(LOGIN_LINK_WARNING);
        setScreen('login');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setScreen('login');
        return;
      }
      const { data: verified, error: verifyErr } = await supabase.auth.getUser();
      if (verifyErr || !verified?.user) {
        await supabase.auth.signOut().catch(() => {});
        setAuthError('Sitzung abgelaufen. Bitte erneut anmelden.');
        setScreen('login');
        return;
      }
      await onSignedIn(verified.user);
    })();

    return () => { sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------------ */
  /* Mutations                                                           */
  /* ------------------------------------------------------------------ */

  const fail = useCallback((e: unknown, what: string) => {
    const message = (e as { message?: string })?.message || String(e);
    console.warn(what, e);
    setSync({ busy: false, message: null, error: `${what}: ${message}` });
    return false;
  }, []);

  const createFamily = useCallback(async (name: string, initialPeople: string[]) => {
    try {
      const { error } = await supabase.rpc('fp_create_family', { p_name: name, p_people: initialPeople });
      if (error) throw error;
      const u = userRef.current;
      if (u) await onSignedIn(u);
      return null;
    } catch (e) {
      const err = e as { message?: string; code?: string };
      console.warn('fp_create_family failed', e);
      // PGRST202 = the function does not exist: the migrations have not been
      // applied to this Supabase project yet. Say so instead of "try later".
      if (err.code === 'PGRST202' || /fp_create_family/.test(err.message || '')) {
        return 'Die Datenbank des Familienplaners ist auf diesem Server noch nicht eingerichtet '
          + '(fp_create_family fehlt). Die Migrationen laufen beim Merge auf main.';
      }
      return 'Familie konnte nicht angelegt werden: ' + (err.message || String(e));
    }
  }, [onSignedIn]);

  const writeEventPeople = useCallback(async (eventId: string, personIds: string[]) => {
    await supabase.from('fp_event_people').delete().eq('event_id', eventId);
    if (personIds.length) {
      const { error } = await supabase.from('fp_event_people')
        .insert(personIds.map(personId => ({ event_id: eventId, person_id: personId })));
      if (error) throw error;
    }
  }, []);

  const eventPayload = useCallback((input: NewEventInput) => {
    const fam = familyRef.current!;
    const tz = fam.timezone;
    const base = {
      family_id: fam.id,
      title: input.title.trim(),
      notes: input.notes.trim(),
      all_day: input.allDay,
      start_date: input.startDate,
      end_date: input.endDate < input.startDate ? input.startDate : input.endDate,
      starts_at: null as string | null,
      ends_at: null as string | null,
      repeat_freq: input.repeat ? input.repeat.freq : null,
      repeat_interval: input.repeat ? input.repeat.interval : 1,
      repeat_weekdays: input.repeat ? input.repeat.weekdays : [],
      repeat_until: input.repeat ? input.repeat.until : null,
    };
    if (!input.allDay && input.startTime && input.endTime) {
      base.starts_at = localToIso(base.start_date, input.startTime, tz);
      base.ends_at = localToIso(base.end_date, input.endTime, tz);
      if (base.ends_at < base.starts_at) base.ends_at = base.starts_at;
    }
    return base;
  }, []);

  const addEvent = useCallback(async (input: NewEventInput) => {
    try {
      const u = userRef.current;
      const { data, error } = await supabase.from('fp_events')
        .insert({ ...eventPayload(input), created_by: u?.id })
        .select('id')
        .single();
      if (error) throw error;
      await writeEventPeople(data.id, input.personIds);
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Eintrag konnte nicht gespeichert werden');
    }
  }, [eventPayload, fail, reload, writeEventPeople]);

  const updateEvent = useCallback(async (
    id: string, input: NewEventInput, scope: EditScope, occurrence: string | null
  ) => {
    try {
      const payload = eventPayload(input);

      // This date only: drop it from the series and add a standalone entry
      // next to it. The series stays as it is, so expanding it needs no
      // special case for changed dates.
      if (scope === 'occurrence' && occurrence) {
        const { error: skipErr } = await supabase.from('fp_event_exceptions')
          .upsert({ event_id: id, occurrence, created_by: userRef.current?.id },
            { onConflict: 'event_id,occurrence' });
        if (skipErr) throw skipErr;

        const { data, error } = await supabase.from('fp_events')
          .insert({
            ...payload,
            repeat_freq: null, repeat_interval: 1, repeat_weekdays: [], repeat_until: null,
            created_by: userRef.current?.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        await writeEventPeople(data.id, input.personIds);
        await reload();
        return true;
      }

      const { error } = await supabase.from('fp_events').update({
        title: payload.title, notes: payload.notes, all_day: payload.all_day,
        start_date: payload.start_date, end_date: payload.end_date,
        starts_at: payload.starts_at, ends_at: payload.ends_at,
        repeat_freq: payload.repeat_freq, repeat_interval: payload.repeat_interval,
        repeat_weekdays: payload.repeat_weekdays, repeat_until: payload.repeat_until,
      }).eq('id', id);
      if (error) throw error;
      await writeEventPeople(id, input.personIds);
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Eintrag konnte nicht geändert werden');
    }
  }, [eventPayload, fail, reload, writeEventPeople]);

  const deleteEvent = useCallback(async (
    id: string, scope: EditScope, occurrence: string | null
  ) => {
    try {
      if (scope === 'occurrence' && occurrence) {
        const { error } = await supabase.from('fp_event_exceptions')
          .upsert({ event_id: id, occurrence, created_by: userRef.current?.id },
            { onConflict: 'event_id,occurrence' });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fp_events').delete().eq('id', id);
        if (error) throw error;
      }
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Eintrag konnte nicht gelöscht werden');
    }
  }, [fail, reload]);

  const addPerson = useCallback(async (name: string) => {
    try {
      const fam = familyRef.current!;
      const palette = ['#2f6f5e', '#a8552f', '#3b5f9e', '#8a4a86', '#6b7a2f', '#b0813a'];
      const { error } = await supabase.from('fp_people').insert({
        family_id: fam.id,
        name: name.trim(),
        color: palette[people.length % palette.length],
        sort_order: people.length,
      });
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Person konnte nicht angelegt werden');
    }
  }, [fail, people.length, reload]);

  const updatePerson = useCallback(async (id: string, patch: Partial<Pick<Person, 'name' | 'shortName' | 'color' | 'aliases' | 'sortOrder' | 'doesTasks'>>) => {
    try {
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.name = patch.name.trim();
      if (patch.shortName !== undefined) row.short_name = patch.shortName?.trim() || null;
      if (patch.color !== undefined) row.color = patch.color;
      if (patch.aliases !== undefined) row.aliases = patch.aliases.map(a => a.trim()).filter(Boolean);
      if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
      if (patch.doesTasks !== undefined) row.does_tasks = patch.doesTasks;
      const { error } = await supabase.from('fp_people').update(row).eq('id', id);
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Person konnte nicht geändert werden');
    }
  }, [fail, reload]);

  const deletePerson = useCallback(async (id: string) => {
    try {
      // Archive instead of delete: past entries keep their column.
      const { error } = await supabase.from('fp_people')
        .update({ archived_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Person konnte nicht entfernt werden');
    }
  }, [fail, reload]);

  const setAssignment = useCallback(async (event: PlannerEvent, personIds: string[], hidden: boolean) => {
    if (!event.calendarId || !event.uid) return false;
    try {
      const fam = familyRef.current!;
      const { error } = await supabase.from('fp_calendar_assignments').upsert({
        family_id: fam.id,
        calendar_id: event.calendarId,
        uid: event.uid,
        occurrence: event.occurrence ?? SERIES_WIDE,
        person_ids: personIds,
        hidden,
        updated_by: userRef.current?.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'calendar_id,uid,occurrence' });
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Zuordnung konnte nicht gespeichert werden');
    }
  }, [fail, reload]);

  const upsertCalendar = useCallback(async (input: { id?: string; label: string; url: string; username: string; password: string; color: string; enabled: boolean }) => {
    try {
      const fam = familyRef.current!;
      const { data, error } = await supabase.functions.invoke('family-calendar-sync', {
        body: {
          action: 'save',
          family_id: fam.id,
          calendar_id: input.id ?? null,
          label: input.label,
          url: input.url,
          username: input.username || null,
          password: input.password || null,
          color: input.color,
          enabled: input.enabled,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Kalender konnte nicht gespeichert werden');
    }
  }, [fail, reload]);

  const deleteCalendar = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.rpc('fp_delete_calendar', { p_calendar_id: id });
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Kalender konnte nicht entfernt werden');
    }
  }, [fail, reload]);

  const refreshCalendars = useCallback(async (force: boolean) => {
    const fam = familyRef.current;
    if (!fam) return;
    setSync({ busy: true, message: 'Kalender werden abgerufen …', error: null });
    try {
      const { data, error } = await supabase.functions.invoke('family-calendar-sync', {
        body: { family_id: fam.id, force },
      });
      if (error) throw error;
      const results = (data?.calendars ?? []) as { status: string; error: string | null }[];
      const failed = results.find(r => r.status === 'error');
      await reload();
      setSync({
        busy: false,
        message: failed ? null : 'Kalender aktualisiert',
        error: failed?.error ?? null,
      });
    } catch (e) {
      const message = (e as { message?: string })?.message || String(e);
      setSync({ busy: false, message: null, error: 'Kalender-Abruf fehlgeschlagen: ' + message });
    }
  }, [reload]);

  // Family-wide display setting; RLS lets only the owner through.
  const setTimeFormat = useCallback(async (format: TimeFormat) => {
    const fam = familyRef.current;
    if (!fam) return false;
    try {
      const { error } = await supabase.from('fp_families')
        .update({ time_format: format }).eq('id', fam.id);
      if (error) throw error;
      const next = { ...fam, timeFormat: format };
      familyRef.current = next;
      setFamily(next);
      return true;
    } catch (e) {
      return fail(e, 'Zeitformat konnte nicht geändert werden');
    }
  }, [fail]);

  const createLinkInvite = useCallback(async (inviteRole: Role) => {
    try {
      const fam = familyRef.current!;
      const { data, error } = await supabase.rpc('fp_create_link_invite', {
        p_family_id: fam.id, p_role: inviteRole,
      });
      if (error) throw error;
      await reload();
      const base = location.origin + location.pathname;
      return `${base}?invite=${data as string}`;
    } catch (e) {
      fail(e, 'Einladung konnte nicht erstellt werden');
      return null;
    }
  }, [fail, reload]);

  const updateMemberRole = useCallback(async (userId: string, newRole: Role) => {
    try {
      const fam = familyRef.current!;
      const { error } = await supabase.from('fp_memberships')
        .update({ role: newRole }).eq('family_id', fam.id).eq('user_id', userId);
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Rolle konnte nicht geändert werden');
    }
  }, [fail, reload]);

  const removeMember = useCallback(async (userId: string) => {
    try {
      const fam = familyRef.current!;
      const { error } = await supabase.from('fp_memberships')
        .delete().eq('family_id', fam.id).eq('user_id', userId);
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Zugriff konnte nicht entzogen werden');
    }
  }, [fail, reload]);

  const setWeatherPlz = useCallback(async (plz: string | null) => {
    const fam = familyRef.current;
    if (!fam) return false;
    try {
      const { error } = await supabase.from('fp_families')
        .update({ weather_plz: plz }).eq('id', fam.id);
      if (error) throw error;
      // Update the family here rather than through reload(): that only reloads
      // a family's *contents*, never the family row, so the new code would not
      // reach refreshWeather() and the fetch would quietly do nothing.
      const next = { ...fam, weatherPlz: plz };
      familyRef.current = next;
      setFamily(next);
      if (!plz) { setWeather([]); setWeatherFetchedAt(null); }
      return true;
    } catch (e) {
      return fail(e, 'Die PLZ konnte nicht gespeichert werden');
    }
  }, [fail]);

  /** Resolves to null on success, or the message to show. */
  const refreshWeather = useCallback(async (force: boolean) => {
    const fam = familyRef.current;
    if (!fam?.weatherPlz) return null;
    try {
      const { data, error } = await supabase.functions.invoke('family-weather', {
        body: { family_id: fam.id, force },
      });
      const message = (data as { error?: string } | null)?.error;
      if (message) throw new Error(message);
      if (error) throw error;
      const payload = data as { days?: WeatherDay[]; fetched_at?: string } | null;
      setWeather(payload?.days ?? []);
      setWeatherFetchedAt(payload?.fetched_at ?? new Date().toISOString());
      return null;
    } catch (e) {
      // A failed refresh leaves the last forecast on screen; stale beats blank.
      return e instanceof Error ? e.message : 'Das Wetter konnte nicht geholt werden';
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /* Menu plans                                                          */
  /* ------------------------------------------------------------------ */

  const upsertMenuSource = useCallback(async (input: {
    id?: string; label: string; baseUrl: string; pathPatterns: string[]; enabled: boolean;
  }) => {
    try {
      const fam = familyRef.current!;
      const row = {
        family_id: fam.id,
        label: input.label.trim(),
        base_url: input.baseUrl.trim(),
        path_patterns: input.pathPatterns.map(p => p.trim()).filter(Boolean),
        enabled: input.enabled,
      };
      const { error } = input.id
        ? await supabase.from('fp_menu_sources').update(row).eq('id', input.id)
        : await supabase.from('fp_menu_sources').insert(row);
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Die Quelle konnte nicht gespeichert werden');
    }
  }, [fail, reload]);

  const deleteMenuSource = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('fp_menu_sources').delete().eq('id', id);
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Die Quelle konnte nicht entfernt werden');
    }
  }, [fail, reload]);

  const setMenuAssignment = useCallback(async (
    sourceId: string, personId: string, weekdays: number[]
  ) => {
    try {
      const { error } = await supabase.from('fp_menu_people').upsert({
        source_id: sourceId, person_id: personId, weekdays,
      }, { onConflict: 'source_id,person_id' });
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Die Zuordnung konnte nicht gespeichert werden');
    }
  }, [fail, reload]);

  const removeMenuAssignment = useCallback(async (sourceId: string, personId: string) => {
    try {
      const { error } = await supabase.from('fp_menu_people')
        .delete().eq('source_id', sourceId).eq('person_id', personId);
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Die Zuordnung konnte nicht entfernt werden');
    }
  }, [fail, reload]);

  /** Resolves to null on success, or the message to show. */
  const importMenuWeek = useCallback(async (
    sourceId: string, year: number, week: number, pdfBase64?: string
  ) => {
    const fam = familyRef.current;
    if (!fam) return 'Keine Familie geladen';
    setSync({ busy: true, message: null, error: null });
    try {
      const { data, error } = await supabase.functions.invoke('family-menu-import', {
        body: { family_id: fam.id, source_id: sourceId, year, week, pdf_base64: pdfBase64 },
      });
      // The function answers with a JSON body on failure too, and that message
      // is the useful one — "Edge Function returned a non-2xx status" is not.
      const message = (data as { error?: string } | null)?.error;
      if (message) throw new Error(message);
      if (error) throw error;
      await reload();
      setSync({ busy: false, message: null, error: null });
      return null;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Der Menüplan konnte nicht geholt werden';
      setSync({ busy: false, message: null, error: message });
      return message;
    }
  }, [reload]);

  const deleteMenuWeek = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('fp_menu_weeks').delete().eq('id', id);
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Die Woche konnte nicht entfernt werden');
    }
  }, [fail, reload]);

  /* ------------------------------------------------------------------ */
  /* Household                                                           */
  /* ------------------------------------------------------------------ */

  const upsertTask = useCallback(async (draft: TaskDraft, id?: string) => {
    try {
      const fam = familyRef.current!;
      const row = taskToRow(draft, fam.id);
      let taskId = id ?? null;
      if (id) {
        const { error } = await supabase.from('fp_tasks').update(row).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('fp_tasks')
          .insert({ ...row, sort_order: tasks.length }).select('id').single();
        if (error) throw error;
        taskId = (data as { id: string }).id;
      }
      await reload();
      return taskId;
    } catch (e) {
      fail(e, 'Die Aufgabe konnte nicht gespeichert werden');
      return null;
    }
  }, [fail, reload, tasks.length]);

  /**
   * Days a list brought in. `ignoreDuplicates` rather than a merge: a date is
   * a date, and pasting the same message twice must not double anything.
   */
  const addTaskDates = useCallback(async (taskId: string, dates: TaskDate[]) => {
    if (!dates.length) return true;
    try {
      const fam = familyRef.current!;
      const { error } = await supabase.from('fp_task_dates').upsert(
        dates.map(d => ({
          family_id: fam.id, task_id: taskId, due_date: d.date, note: d.note,
        })),
        { onConflict: 'task_id,due_date', ignoreDuplicates: true }
      );
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Die Termine konnten nicht gespeichert werden');
    }
  }, [fail, reload]);

  const removeTaskDate = useCallback(async (taskId: string, date: string) => {
    try {
      const { error } = await supabase.from('fp_task_dates')
        .delete().eq('task_id', taskId).eq('due_date', date);
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Der Termin konnte nicht entfernt werden');
    }
  }, [fail, reload]);

  const deleteTask = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('fp_tasks').delete().eq('id', id);
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Die Aufgabe konnte nicht entfernt werden');
    }
  }, [fail, reload]);

  const addStarterTasks = useCallback(async () => {
    try {
      const fam = familyRef.current!;
      const rows = STARTER_TASKS.map((d, i) => ({
        ...taskToRow(d, fam.id), sort_order: tasks.length + i,
      }));
      const { error } = await supabase.from('fp_tasks').insert(rows);
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Die Vorschläge konnten nicht angelegt werden');
    }
  }, [fail, reload, tasks.length]);

  /**
   * Booking a run is the one thing that happens several times a day, so it
   * does not go through reload(): the row comes back from the insert and goes
   * straight into the list. A tap that waits for nine queries is a tap that
   * stops happening.
   */
  const logTask = useCallback(async (taskId: string, personId: string, minutes: number) => {
    try {
      const fam = familyRef.current!;
      const { data, error } = await supabase.from('fp_task_logs').insert({
        family_id: fam.id,
        task_id: taskId,
        person_id: personId,
        minutes: Math.max(1, Math.round(minutes)),
        created_by: userRef.current?.id ?? null,
      }).select('id, task_id, person_id, done_at, minutes').single();
      if (error) throw error;
      const log = rowToLog(data as Record<string, unknown>);
      setTaskLogs(prev => [log, ...prev]);
      return log;
    } catch (e) {
      fail(e, 'Das konnte nicht erfasst werden');
      return null;
    }
  }, [fail]);

  const setLogMinutes = useCallback(async (logId: string, minutes: number) => {
    const next = Math.max(1, Math.round(minutes));
    setTaskLogs(prev => prev.map(l => (l.id === logId ? { ...l, minutes: next } : l)));
    try {
      const { error } = await supabase.from('fp_task_logs').update({ minutes: next }).eq('id', logId);
      if (error) throw error;
      return true;
    } catch (e) {
      await reload();
      return fail(e, 'Die Dauer konnte nicht geändert werden');
    }
  }, [fail, reload]);

  const deleteTaskLog = useCallback(async (logId: string) => {
    const before = taskLogs;
    setTaskLogs(prev => prev.filter(l => l.id !== logId));
    try {
      const { error } = await supabase.from('fp_task_logs').delete().eq('id', logId);
      if (error) throw error;
      return true;
    } catch (e) {
      setTaskLogs(before);
      return fail(e, 'Der Eintrag konnte nicht entfernt werden');
    }
  }, [fail, taskLogs]);

  /* ------------------------------------------------------------------ */
  /* Cantons                                                             */
  /* ------------------------------------------------------------------ */

  const addTrip = useCallback(async (input: NewTripInput) => {
    try {
      const fam = familyRef.current!;
      const { error } = await supabase.from('fp_trips').insert({
        ...tripToRow(input), family_id: fam.id, created_by: userRef.current?.id ?? null,
      });
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Der Ausflug konnte nicht gespeichert werden');
    }
  }, [fail, reload]);

  const updateTrip = useCallback(async (
    id: string, patch: Partial<NewTripInput> & { done?: boolean }
  ) => {
    try {
      const current = trips.find(t => t.id === id);
      if (!current) return false;
      const next: NewTripInput = { ...current, ...patch };
      // Ticking one off keeps the day it happened; unticking clears it.
      const row = tripToRow(next);
      if (patch.done === true && !current.done && patch.doneOn === undefined) {
        row.done_on = current.fromDate ?? new Date().toISOString().slice(0, 10);
      }
      const { error } = await supabase.from('fp_trips').update(row).eq('id', id);
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Der Ausflug konnte nicht geändert werden');
    }
  }, [fail, reload, trips]);

  const deleteTrip = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('fp_trips').delete().eq('id', id);
      if (error) throw error;
      await reload();
      return true;
    } catch (e) {
      return fail(e, 'Der Ausflug konnte nicht entfernt werden');
    }
  }, [fail, reload]);

  /** Resolves to null on success, or the message to show. */
  const fetchTripIdeas = useCallback(async (canton: string, wishes: string, refresh: boolean) => {
    const fam = familyRef.current;
    if (!fam) return 'Keine Familie geladen';
    setSync({ busy: true, message: 'Ideen werden geholt …', error: null });
    try {
      const { data, error } = await supabase.functions.invoke('family-trip-ideas', {
        body: { family_id: fam.id, canton, wishes, refresh },
      });
      // The function answers with a JSON body on failure too, and that message
      // is the useful one — "Edge Function returned a non-2xx status" is not.
      const message = (data as { error?: string } | null)?.error;
      if (message) throw new Error(message);
      if (error) throw error;
      await reload();
      setSync({ busy: false, message: null, error: null });
      return null;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Die Ideen konnten nicht geholt werden';
      setSync({ busy: false, message: null, error: message });
      return message;
    }
  }, [reload]);

  const discardTripIdea = useCallback(async (id: string) => {
    setTripIdeas(prev => prev.filter(i => i.id !== id));
    try {
      const { error } = await supabase.from('fp_trip_ideas').delete().eq('id', id);
      if (error) throw error;
      return true;
    } catch (e) {
      await reload();
      return fail(e, 'Die Idee konnte nicht entfernt werden');
    }
  }, [fail, reload]);

  // One opportunistic refresh per session once the plan is on screen. The
  // Edge Function is a no-op while every calendar's cache is inside its TTL,
  // so several viewers opening the planner cost one fetch, not one each.
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (screen !== 'app' || autoSyncedRef.current || !family) return;
    // The screen only becomes 'app' once the family's contents are loaded, so
    // both of these see their real state. The weather is asked for on its own:
    // a family with no calendar still wants the forecast.
    autoSyncedRef.current = true;
    if (calendars.some(c => c.enabled)) refreshCalendars(false);
    if (family.weatherPlz) refreshWeather(false);
  }, [screen, family, calendars, refreshCalendars, refreshWeather]);

  /* ------------------------------------------------------------------ */

  const calendarEvents = useMemo(
    () => calendarEventsToPlanner(caches, calendars, people, assignments, family?.timezone),
    [caches, calendars, people, assignments, family?.timezone]
  );

  const menuEvents = useMemo(
    () => menuEventsToPlanner(menuWeeks, menuSources, menuAssignments),
    [menuWeeks, menuSources, menuAssignments]
  );

  const value: AppContextValue = {
    screen, user, family, role, canEdit, isOwner, people, calendars,
    manualSeries, calendarEvents, weather, weatherFetchedAt,
    menuSources, menuWeeks, menuAssignments, menuEvents,
    tasks, taskLogs, trips, tripIdeas,
    members, openInvites, sync, authError, setAuthError, loginWarning, setLoginWarning,
    inviteToken,
    createFamily, addEvent, updateEvent, deleteEvent,
    addPerson, updatePerson, deletePerson, setAssignment,
    upsertCalendar, deleteCalendar, refreshCalendars, setTimeFormat,
    setWeatherPlz, refreshWeather,
    upsertMenuSource, deleteMenuSource, setMenuAssignment, removeMenuAssignment,
    importMenuWeek, deleteMenuWeek,
    addTrip, updateTrip, deleteTrip, fetchTripIdeas, discardTripIdea,
    upsertTask, deleteTask, addStarterTasks, addTaskDates, removeTaskDate,
    logTask, setLogMinutes, deleteTaskLog,
    createLinkInvite, updateMemberRole, removeMember, reload,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
