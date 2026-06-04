/* eslint-disable react-refresh/only-export-components */
// Central app state + Supabase data layer. Mirrors the globals and the
// auth/cloud functions of the vanilla app.js one-to-one so the e2e contract
// (#user-strip readiness gating, sync-status semantics, role visibility)
// stays identical.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { sanitizeState } from '../lib/state';
import type { AppState, Employer, Employee, PaySettingsData } from '../lib/state';

export type Role = 'owner' | 'admin' | 'employee';

export type Member = { user_id: string; email: string; full_name: string | null; role: Role };

export type PendingInvite = {
  id: string;
  household_id: string;
  role: Role;
  households: { name: string } | null;
};

export type SyncState = {
  visible: boolean;
  state: 'idle' | 'ok' | 'pending' | 'error';
  warn: string | null; // text for #sync-warn, null = hidden
};

export type Ui = {
  login: boolean;
  create: boolean;
  strip: boolean;
  invite: PendingInvite | null;
};

export type TabId = 'erfassung' | 'monat' | 'jahr' | 'stammdaten' | 'einstellungen' | 'mitglieder' | 'info';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'erfassung',     label: 'Stundenerfassung' },
  { id: 'monat',         label: 'Monatsabrechnung' },
  { id: 'jahr',          label: 'Jahresübersicht' },
  { id: 'stammdaten',    label: 'Stammdaten' },
  { id: 'einstellungen', label: 'Einstellungen' },
  { id: 'mitglieder',    label: 'Mitglieder' },
  { id: 'info',          label: 'Info' }
];

type AppContextValue = {
  user: User | null;
  role: Role | null;
  householdId: string | null;
  members: Map<string, Member>;
  data: AppState;
  ui: Ui;
  sync: SyncState;
  authError: string | null;
  setAuthError: (msg: string | null) => void;
  activeTab: TabId;
  tabVisible: Record<TabId, boolean>;
  showTab: (id: TabId) => void;
  // Mirrors the vanilla lazy rendering: #entries-list / #pay-settings-list
  // stay at their initial markup until renderEntries()/renderPaySettingsTab()
  // would have run (successful sign-in, or the tab being clicked).
  primedTabs: ReadonlySet<TabId>;
  setSyncStatus: (s: 'ok' | 'pending' | 'error', err?: unknown) => void;
  refreshSignedIn: () => Promise<void>;
  hideInviteBanner: () => void;
  updateEmployer: (patch: Partial<Employer>) => void;
  updateEmployee: (patch: Partial<Employee>) => void;
  addShift: (s: { date: string; hours: number; note: string }) => Promise<void>;
  deleteShift: (id: string) => Promise<void>;
  addPaySettings: (effectiveMonth: string, data: PaySettingsData) => Promise<boolean>;
  updatePaySettings: (id: string, data: PaySettingsData) => Promise<boolean>;
  deletePaySettings: (id: string) => Promise<boolean>;
  importState: (parsed: unknown) => Promise<void>;
  clearAll: () => Promise<void>;
  loadMembersList: () => Promise<Member[]>;
  loadInvitesList: () => Promise<{ id: string; email: string; role: Role; created_at: string }[]>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside AppProvider');
  return ctx;
}

const INITIAL_TAB_VISIBLE: Record<TabId, boolean> = {
  erfassung: true, monat: true, jahr: true, stammdaten: true,
  einstellungen: true, mitglieder: false, info: true
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [members, setMembers] = useState<Map<string, Member>>(new Map());
  const [data, setDataState] = useState<AppState>(() => sanitizeState({}));
  const [ui, setUi] = useState<Ui>({ login: true, create: false, strip: false, invite: null });
  const [sync, setSync] = useState<SyncState>({ visible: false, state: 'idle', warn: null });
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('erfassung');
  const [tabVisible, setTabVisible] = useState<Record<TabId, boolean>>(INITIAL_TAB_VISIBLE);
  const [primedTabs, setPrimedTabs] = useState<ReadonlySet<TabId>>(new Set());

  // Refs so async data-layer functions always see current values.
  const userRef = useRef(user);
  const roleRef = useRef(role);
  const householdIdRef = useRef(householdId);
  const dataRef = useRef(data);
  const activeTabRef = useRef(activeTab);
  const tabVisibleRef = useRef(tabVisible);
  userRef.current = user;
  roleRef.current = role;
  householdIdRef.current = householdId;
  activeTabRef.current = activeTab;
  tabVisibleRef.current = tabVisible;

  const setData = useCallback((updater: AppState | ((prev: AppState) => AppState)) => {
    setDataState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      dataRef.current = next;
      return next;
    });
  }, []);

  const setSyncStatus = useCallback((s: 'ok' | 'pending' | 'error', err?: unknown) => {
    if (s === 'error') {
      const e = err as { message?: string } | string | undefined;
      const message = (e && typeof e === 'object' && e.message) ? e.message : (e ? String(e) : 'unbekannter Fehler');
      console.warn('sync error', err);
      setSync({ visible: true, state: s, warn: 'Synchronisation fehlgeschlagen: ' + message });
    } else {
      setSync({ visible: true, state: s, warn: null });
    }
  }, []);

  const showLogin = useCallback(() => {
    setUi({ login: true, create: false, strip: false, invite: null });
    setSync(s => ({ ...s, visible: false }));
  }, []);

  /* ---- AUTH FLOW ---- */
  const fetchMembership = useCallback(async () => {
    const u = userRef.current;
    if (!u) return null;
    const { data: rows, error } = await supabase
      .from('memberships')
      .select('household_id, role, created_at')
      .eq('user_id', u.id)
      .order('created_at', { ascending: true })
      .order('household_id', { ascending: true })
      .limit(1);
    if (error) { console.warn(error); return null; }
    return (rows && rows[0]) || null;
  }, []);

  const fetchPendingInvite = useCallback(async (): Promise<PendingInvite | null> => {
    const u = userRef.current;
    if (!u?.email) return null;
    const { data: rows, error } = await supabase
      .from('invites')
      .select('id, household_id, role, households(name)')
      .ilike('email', u.email)
      .is('accepted_at', null)
      .limit(1);
    if (error) { console.warn(error); return null; }
    return ((rows && rows[0]) as unknown as PendingInvite) || null;
  }, []);

  const loadFromCloud = useCallback(async (hh: string) => {
    const [profileRes, shiftsRes, settingsRes] = await Promise.all([
      supabase.from('household_profile').select('*').eq('household_id', hh).maybeSingle(),
      supabase.from('shifts').select('id, date, hours, note, entered_by').eq('household_id', hh).order('date'),
      supabase.from('pay_settings').select('id, effective_month, data').eq('household_id', hh).order('effective_month')
    ]);
    if (profileRes.error) throw profileRes.error;
    if (shiftsRes.error) throw shiftsRes.error;
    if (settingsRes.error) throw settingsRes.error;

    const profileRow = (profileRes.data || {}) as { employer?: unknown; employee?: unknown };
    setData(sanitizeState({
      employer: profileRow.employer,
      employee: profileRow.employee,
      paySettings: (settingsRes.data || []).map(r => ({
        id: r.id,
        effectiveMonth: r.effective_month,
        data: r.data
      })),
      shifts: (shiftsRes.data || []).map(r => ({
        id: r.id, date: r.date, hours: Number(r.hours),
        note: r.note || '', entered_by: r.entered_by
      }))
    }));
  }, [setData]);

  const loadMembers = useCallback(async (hh: string): Promise<Member[]> => {
    const { data: rows, error } = await supabase.rpc('members_of_household', { h: hh });
    if (error) throw error;
    const list = (rows || []) as Member[];
    setMembers(new Map(list.map(m => [m.user_id, m])));
    return list;
  }, []);

  const applyRoleVisibility = useCallback((r: Role) => {
    const employeeAllowed: TabId[] = ['erfassung'];
    const adminAllowed: TabId[] = ['erfassung', 'monat', 'jahr', 'stammdaten', 'einstellungen', 'info'];
    const next = { ...tabVisibleRef.current };
    for (const t of TABS) {
      if (r === 'employee')   next[t.id] = employeeAllowed.includes(t.id);
      else if (r === 'admin') next[t.id] = adminAllowed.includes(t.id);
      else                    next[t.id] = true;
    }
    setTabVisible(next);
    tabVisibleRef.current = next;
    if (!next[activeTabRef.current]) setActiveTab('erfassung');
  }, []);

  const onSignedIn = useCallback(async (u: User) => {
    userRef.current = u;
    setUser(u);

    let membership = await fetchMembership();
    if (!membership) {
      const invite = await fetchPendingInvite();
      if (invite) {
        // hideLogin() + invite banner: strip visible, main app shown with empty data.
        setUi({ login: false, create: false, strip: true, invite });
        return;
      }
      await new Promise(r => setTimeout(r, 800));
      membership = await fetchMembership();
    }

    if (!membership) {
      setUi({ login: false, create: true, strip: false, invite: null });
      setSync(s => ({ ...s, visible: false }));
      return;
    }

    const hh = membership.household_id as string;
    const r = membership.role as Role;
    householdIdRef.current = hh;
    roleRef.current = r;
    setHouseholdId(hh);
    setRole(r);

    try {
      await loadFromCloud(hh);
    } catch (e) {
      setSyncStatus('error', e);
      showLogin();
      return;
    }

    if (r === 'owner' || r === 'admin') {
      try { await loadMembers(hh); } catch (e) { console.warn(e); }
    }

    setUi({ login: false, create: false, strip: true, invite: null });
    applyRoleVisibility(r);
    // onSignedIn calls renderEntries() + renderPaySettingsTab() in the vanilla app.
    setPrimedTabs(prev => new Set([...prev, 'erfassung' as TabId, 'einstellungen' as TabId]));
    setSyncStatus('ok');
  }, [applyRoleVisibility, fetchMembership, fetchPendingInvite, loadFromCloud, loadMembers, setSyncStatus, showLogin]);

  const refreshSignedIn = useCallback(async () => {
    const u = userRef.current;
    if (u) await onSignedIn(u);
  }, [onSignedIn]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && session.user) {
        onSignedIn(session.user);
      } else if (event === 'SIGNED_OUT') {
        userRef.current = null;
        householdIdRef.current = null;
        roleRef.current = null;
        setUser(null);
        setHouseholdId(null);
        setRole(null);
        setMembers(new Map());
        setData(sanitizeState({}));
        showLogin();
      }
    });

    (async function bootstrap() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        showLogin();
        return;
      }
      const { data: verified, error: verifyErr } = await supabase.auth.getUser();
      if (verifyErr || !verified?.user) {
        console.warn('[auth] local session rejected by server, signing out:', verifyErr);
        await supabase.auth.signOut().catch(() => {});
        setAuthError('Sitzung abgelaufen. Bitte erneut anmelden.'
          + (verifyErr?.message ? ' (' + verifyErr.message + ')' : ''));
        showLogin();
        return;
      }
      await onSignedIn(verified.user);
    })();

    return () => { sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- TABS ---- */
  const showTab = useCallback((id: TabId) => {
    if (!tabVisibleRef.current[id]) return;
    setActiveTab(id);
    setPrimedTabs(prev => prev.has(id) ? prev : new Set([...prev, id]));
  }, []);

  const hideInviteBanner = useCallback(() => {
    setUi(prev => ({ ...prev, invite: null }));
  }, []);

  /* ---- CLOUD SAVE: household_profile (debounced) ---- */
  const profileSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistHouseholdProfile = useCallback(() => {
    const r = roleRef.current;
    if (r !== 'owner' && r !== 'admin') return;
    setSyncStatus('pending');
    if (profileSaveTimer.current) clearTimeout(profileSaveTimer.current);
    profileSaveTimer.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('household_profile')
          .upsert({
            household_id: householdIdRef.current,
            employer: dataRef.current.employer,
            employee: dataRef.current.employee,
            updated_at: new Date().toISOString()
          });
        if (error) throw error;
        setSyncStatus('ok');
      } catch (e) {
        setSyncStatus('error', e);
      }
    }, 1000);
  }, [setSyncStatus]);

  const updateEmployer = useCallback((patch: Partial<Employer>) => {
    setData(prev => ({ ...prev, employer: { ...prev.employer, ...patch } }));
    persistHouseholdProfile();
  }, [persistHouseholdProfile, setData]);

  const updateEmployee = useCallback((patch: Partial<Employee>) => {
    setData(prev => ({ ...prev, employee: { ...prev.employee, ...patch } }));
    persistHouseholdProfile();
  }, [persistHouseholdProfile, setData]);

  /* ---- CLOUD SAVE: shifts ---- */
  const addShift = useCallback(async ({ date, hours, note }: { date: string; hours: number; note: string }) => {
    setSyncStatus('pending');
    try {
      const { data: row, error } = await supabase
        .from('shifts')
        .insert({
          household_id: householdIdRef.current,
          date, hours, note,
          entered_by: userRef.current?.id
        })
        .select()
        .single();
      if (error) throw error;
      setData(prev => ({
        ...prev,
        shifts: [...prev.shifts, {
          id: row.id, date: row.date, hours: Number(row.hours),
          note: row.note || '', entered_by: row.entered_by
        }].sort((a, b) => a.date.localeCompare(b.date))
      }));
      setSyncStatus('ok');
    } catch (e) { setSyncStatus('error', e); }
  }, [setData, setSyncStatus]);

  const deleteShift = useCallback(async (id: string) => {
    setSyncStatus('pending');
    try {
      const { error } = await supabase.from('shifts').delete().eq('id', id);
      if (error) throw error;
      setData(prev => ({ ...prev, shifts: prev.shifts.filter(x => x.id !== id) }));
      setSyncStatus('ok');
    } catch (e) { setSyncStatus('error', e); }
  }, [setData, setSyncStatus]);

  /* ---- CLOUD SAVE: pay_settings ---- */
  const addPaySettings = useCallback(async (effectiveMonth: string, psData: PaySettingsData): Promise<boolean> => {
    setSyncStatus('pending');
    try {
      const { data: row, error } = await supabase
        .from('pay_settings')
        .insert({
          household_id: householdIdRef.current,
          effective_month: effectiveMonth,
          data: psData
        })
        .select()
        .single();
      if (error) throw error;
      setData(prev => ({
        ...prev,
        paySettings: [...prev.paySettings, { id: row.id, effectiveMonth: row.effective_month, data: row.data }]
          .sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth))
      }));
      setSyncStatus('ok');
      return true;
    } catch (e) {
      setSyncStatus('error', e);
      return false;
    }
  }, [setData, setSyncStatus]);

  const updatePaySettings = useCallback(async (id: string, psData: PaySettingsData): Promise<boolean> => {
    setSyncStatus('pending');
    try {
      const { data: row, error } = await supabase
        .from('pay_settings')
        .update({ data: psData })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      setData(prev => ({
        ...prev,
        paySettings: prev.paySettings.map(v => v.id === id ? { ...v, data: row.data } : v)
      }));
      setSyncStatus('ok');
      return true;
    } catch (e) {
      setSyncStatus('error', e);
      return false;
    }
  }, [setData, setSyncStatus]);

  const deletePaySettings = useCallback(async (id: string): Promise<boolean> => {
    setSyncStatus('pending');
    try {
      const { error } = await supabase.from('pay_settings').delete().eq('id', id);
      if (error) throw error;
      setData(prev => ({ ...prev, paySettings: prev.paySettings.filter(v => v.id !== id) }));
      setSyncStatus('ok');
      return true;
    } catch (e) {
      setSyncStatus('error', e);
      return false;
    }
  }, [setData, setSyncStatus]);

  /* ---- DATEN VERWALTEN ---- */
  const importState = useCallback(async (parsed: unknown) => {
    const fresh = sanitizeState(parsed);
    const hh = householdIdRef.current;
    setSyncStatus('pending');
    const { error: profErr } = await supabase.from('household_profile').upsert({
      household_id: hh,
      employer: fresh.employer,
      employee: fresh.employee,
      updated_at: new Date().toISOString()
    });
    if (profErr) throw profErr;
    // Order matters: triggers reject pay_settings changes while shifts cover the period.
    // Drop shifts first, then pay_settings, then re-insert pay_settings, then shifts.
    const { error: delShiftsErr } = await supabase.from('shifts').delete().eq('household_id', hh);
    if (delShiftsErr) throw delShiftsErr;
    const { error: delPsErr } = await supabase.from('pay_settings').delete().eq('household_id', hh);
    if (delPsErr) throw delPsErr;
    if (fresh.paySettings.length) {
      const psRows = fresh.paySettings.map(v => ({
        household_id: hh,
        effective_month: v.effectiveMonth,
        data: v.data
      }));
      const { error: insPsErr } = await supabase.from('pay_settings').insert(psRows);
      if (insPsErr) throw insPsErr;
    }
    if (fresh.shifts.length) {
      const rows = fresh.shifts.map(e => ({
        household_id: hh,
        date: e.date, hours: e.hours, note: e.note,
        entered_by: userRef.current?.id
      }));
      const { error: insErr } = await supabase.from('shifts').insert(rows);
      if (insErr) throw insErr;
    }
    await loadFromCloud(hh!);
    setSyncStatus('ok');
  }, [loadFromCloud, setSyncStatus]);

  const clearAll = useCallback(async () => {
    const hh = householdIdRef.current;
    setSyncStatus('pending');
    try {
      const { error: delShiftsErr } = await supabase.from('shifts').delete().eq('household_id', hh);
      if (delShiftsErr) throw delShiftsErr;
      const { error: delPsErr } = await supabase.from('pay_settings').delete().eq('household_id', hh);
      if (delPsErr) throw delPsErr;
      const blank = sanitizeState({});
      const { error: profErr } = await supabase.from('household_profile').upsert({
        household_id: hh,
        employer: blank.employer,
        employee: blank.employee,
        updated_at: new Date().toISOString()
      });
      if (profErr) throw profErr;
      setData(blank);
      setSyncStatus('ok');
    } catch (e) {
      setSyncStatus('error', e);
      throw e;
    }
  }, [setData, setSyncStatus]);

  /* ---- MITGLIEDER ---- */
  const loadMembersList = useCallback(async (): Promise<Member[]> => {
    return loadMembers(householdIdRef.current!);
  }, [loadMembers]);

  const loadInvitesList = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from('invites')
      .select('id, email, role, created_at, accepted_at')
      .eq('household_id', householdIdRef.current)
      .is('accepted_at', null);
    if (error) throw error;
    return (rows || []) as { id: string; email: string; role: Role; created_at: string }[];
  }, []);

  const value = useMemo<AppContextValue>(() => ({
    user, role, householdId, members, data, ui, sync, authError, setAuthError,
    activeTab, tabVisible, showTab, primedTabs, setSyncStatus, refreshSignedIn, hideInviteBanner,
    updateEmployer, updateEmployee, addShift, deleteShift,
    addPaySettings, updatePaySettings, deletePaySettings,
    importState, clearAll, loadMembersList, loadInvitesList
  }), [
    user, role, householdId, members, data, ui, sync, authError,
    activeTab, tabVisible, showTab, primedTabs, setSyncStatus, refreshSignedIn, hideInviteBanner,
    updateEmployer, updateEmployee, addShift, deleteShift,
    addPaySettings, updatePaySettings, deletePaySettings,
    importState, clearAll, loadMembersList, loadInvitesList
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
