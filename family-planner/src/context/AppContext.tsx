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
import type { ManualSeries, RepeatRule } from '../lib/recurrence.ts';
import type { CalendarCacheEntry } from '../lib/merge.ts';
import type {
  Assignment, Calendar, CachedEvent, Family, Member, OpenInvite, Person, PlannerEvent, Role, TimeFormat,
} from '../lib/types.ts';

const NEUTRAL_COLOR = '#6b7280';
// fp_calendar_assignments.occurrence uses this instead of NULL for an override
// that applies to a whole series — a primary-key column cannot be null.
const SERIES_WIDE = '-infinity';
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
  /** null = einmalig. */
  repeat?: RepeatRule | null;
};

/**
 * Reicht eine Änderung an einer Serie nur bis zu diesem einen Termin, oder
 * gilt sie für alle?
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
  /** Selbst erfasste Einträge, noch als Serie — der Planer löst sie für den
   *  sichtbaren Zeitraum auf. */
  manualSeries: ManualSeries[];
  /** Termine aus den verbundenen Kalendern, bereits aufgelöst. */
  calendarEvents: PlannerEvent[];
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
  updatePerson: (id: string, patch: Partial<Pick<Person, 'name' | 'shortName' | 'color' | 'aliases' | 'sortOrder'>>) => Promise<boolean>;
  deletePerson: (id: string) => Promise<boolean>;
  setAssignment: (event: PlannerEvent, personIds: string[], hidden: boolean) => Promise<boolean>;
  upsertCalendar: (input: { id?: string; label: string; url: string; username: string; password: string; color: string; enabled: boolean }) => Promise<boolean>;
  deleteCalendar: (id: string) => Promise<boolean>;
  refreshCalendars: (force: boolean) => Promise<void>;
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
    const [peopleRes, eventsRes, calendarsRes, cacheRes, assignRes] = await Promise.all([
      supabase.from('fp_people').select('*').eq('family_id', fam.id).is('archived_at', null).order('sort_order'),
      supabase.from('fp_events')
        .select('id, title, notes, all_day, start_date, end_date, starts_at, ends_at, '
          + 'repeat_freq, repeat_interval, repeat_weekdays, repeat_until, '
          + 'fp_event_people(person_id), fp_event_exceptions(occurrence)')
        .eq('family_id', fam.id).order('start_date'),
      supabase.from('fp_calendars').select('*').eq('family_id', fam.id).order('created_at'),
      supabase.from('fp_calendar_cache').select('calendar_id, events').eq('family_id', fam.id),
      supabase.from('fp_calendar_assignments').select('calendar_id, uid, occurrence, person_ids, hidden').eq('family_id', fam.id),
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
      ttlMinutes: c.ttl_minutes ?? 30,
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
      .select('id, name, timezone, week_start, time_format')
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

      // Nur dieser Termin: den einen aus der Serie nehmen und daneben einen
      // eigenständigen Eintrag anlegen. Die Serie selbst bleibt unangetastet,
      // und die Auflösung braucht keinen Sonderfall für geänderte Termine.
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

  const updatePerson = useCallback(async (id: string, patch: Partial<Pick<Person, 'name' | 'shortName' | 'color' | 'aliases' | 'sortOrder'>>) => {
    try {
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.name = patch.name.trim();
      if (patch.shortName !== undefined) row.short_name = patch.shortName?.trim() || null;
      if (patch.color !== undefined) row.color = patch.color;
      if (patch.aliases !== undefined) row.aliases = patch.aliases.map(a => a.trim()).filter(Boolean);
      if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
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
      // Adresse und Zugangsdaten gehen an die Edge Function, nicht an Postgres:
      // nur sie hat den Schlüssel, mit dem sie verschlüsselt abgelegt werden.
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

  // One opportunistic refresh per session once the plan is on screen. The
  // Edge Function is a no-op while every calendar's cache is inside its TTL,
  // so several viewers opening the planner cost one fetch, not one each.
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (screen !== 'app' || autoSyncedRef.current) return;
    if (calendars.some(c => c.enabled)) {
      autoSyncedRef.current = true;
      refreshCalendars(false);
    }
  }, [screen, calendars, refreshCalendars]);

  /* ------------------------------------------------------------------ */

  const calendarEvents = useMemo(
    () => calendarEventsToPlanner(caches, calendars, people, assignments),
    [caches, calendars, people, assignments]
  );

  const value: AppContextValue = {
    screen, user, family, role, canEdit, isOwner, people, calendars,
    manualSeries, calendarEvents,
    members, openInvites, sync, authError, setAuthError, loginWarning, setLoginWarning,
    inviteToken,
    createFamily, addEvent, updateEvent, deleteEvent,
    addPerson, updatePerson, deletePerson, setAssignment,
    upsertCalendar, deleteCalendar, refreshCalendars, setTimeFormat,
    createLinkInvite, updateMemberRole, removeMember, reload,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
