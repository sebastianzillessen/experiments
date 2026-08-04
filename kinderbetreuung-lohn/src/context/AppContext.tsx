/* eslint-disable react-refresh/only-export-components */
// Central app state + Supabase data layer. Mirrors the globals and the
// auth/cloud functions of the vanilla app.js one-to-one so the e2e contract
// (#user-strip readiness gating, sync-status semantics, role visibility)
// stays identical.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, hadAuthErrorInUrl, getPendingInviteToken, clearPendingInviteToken } from '../supabaseClient';
import { sanitizeState, sanitizeEmployeeData } from '../lib/state';
import type { AppState, Employer, EmployeeData, EmploymentType, PaySettingsData } from '../lib/state';
import { activeEmployees, ownEmployee as ownEmployeeOf } from '../lib/payroll';

export type Role = 'owner' | 'admin' | 'employee';

export type Member = { user_id: string; email: string; full_name: string | null; role: Role };

// email is null for link invites (invited by URL, no email known); token is
// non-null only for link invites and carries the shareable secret.
export type OpenInvite = { id: string; email: string | null; role: Role; employeeId: string | null; token: string | null; createdAt: string };

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

export type TabId = 'erfassung' | 'monat' | 'jahr' | 'stammdaten' | 'mitarbeitende' | 'einstellungen' | 'mitglieder' | 'info';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'erfassung',     label: 'Stundenerfassung' },
  { id: 'monat',         label: 'Monatsabrechnung' },
  { id: 'jahr',          label: 'Jahresübersicht' },
  { id: 'stammdaten',    label: 'Stammdaten' },
  { id: 'mitarbeitende', label: 'Mitarbeitende' },
  { id: 'einstellungen', label: 'Einstellungen' },
  { id: 'mitglieder',    label: 'Mitglieder' },
  { id: 'info',          label: 'Info' }
];

type AppContextValue = {
  user: User | null;
  role: Role | null;
  householdId: string | null;
  members: Map<string, Member>;
  openInvites: OpenInvite[];
  data: AppState;
  ui: Ui;
  sync: SyncState;
  authError: string | null;
  setAuthError: (msg: string | null) => void;
  loginWarning: string | null;
  setLoginWarning: (msg: string | null) => void;
  // True while the user arrived via a password-recovery link and has not yet
  // set a new password — the set-password overlay is shown on top.
  recoveryMode: boolean;
  setRecoveryMode: (on: boolean) => void;
  activeTab: TabId;
  tabVisible: Record<TabId, boolean>;
  showTab: (id: TabId) => void;
  // Mirrors the vanilla lazy rendering: #entries-list / #pay-settings-list
  // stay at their initial markup until renderEntries()/renderPaySettingsTab()
  // would have run (successful sign-in, or the tab being clicked).
  primedTabs: ReadonlySet<TabId>;
  // Which employee the Stundenerfassung form attributes new shifts to.
  selectedEmployeeId: string | null;
  setSelectedEmployeeId: (id: string | null) => void;
  setSyncStatus: (s: 'ok' | 'pending' | 'error', err?: unknown) => void;
  refreshSignedIn: () => Promise<void>;
  hideInviteBanner: () => void;
  updateHouseholdName: (name: string) => void;
  updateEmployer: (patch: Partial<Employer>) => void;
  addShift: (s: { date: string; hours: number | null; note: string; employeeId: string }) => Promise<void>;
  deleteShift: (id: string) => Promise<void>;
  addEmployee: (data: EmployeeData) => Promise<string | null>;
  updateEmployee: (id: string, patch: { data?: EmployeeData; archived_at?: string | null }) => Promise<boolean>;
  addWage: (employeeId: string, effectiveMonth: string, amount: number, kind?: EmploymentType) => Promise<boolean>;
  updateWage: (employeeId: string, id: string, amount: number, kind?: EmploymentType) => Promise<boolean>;
  deleteWage: (employeeId: string, id: string) => Promise<boolean>;
  addPaySettings: (effectiveMonth: string, data: PaySettingsData) => Promise<boolean>;
  updatePaySettings: (id: string, data: PaySettingsData) => Promise<boolean>;
  deletePaySettings: (id: string) => Promise<boolean>;
  importState: (parsed: unknown) => Promise<void>;
  clearAll: () => Promise<void>;
  loadMembersList: () => Promise<Member[]>;
  reloadInvites: () => Promise<OpenInvite[]>;
  createInvite: (args: { email: string; role: Role; employeeId?: string | null }) => Promise<boolean>;
  // Mint a URL invite for someone whose email we don't know. Returns the full
  // shareable link (…?invite=<token>) or null on failure.
  createLinkInvite: (args: { role: Role; employeeId?: string | null }) => Promise<string | null>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside AppProvider');
  return ctx;
}

const INITIAL_TAB_VISIBLE: Record<TabId, boolean> = {
  erfassung: true, monat: true, jahr: true, stammdaten: true,
  mitarbeitende: true, einstellungen: true, mitglieder: false, info: true
};

const LOGIN_LINK_WARNING = 'Dein Anmelde-Link war ungültig oder ist abgelaufen. Bitte fordere unten einen neuen Link an.';

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [members, setMembers] = useState<Map<string, Member>>(new Map());
  const [openInvites, setOpenInvites] = useState<OpenInvite[]>([]);
  const [data, setDataState] = useState<AppState>(() => sanitizeState({}));
  const [ui, setUi] = useState<Ui>({ login: true, create: false, strip: false, invite: null });
  const [sync, setSync] = useState<SyncState>({ visible: false, state: 'idle', warn: null });
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginWarning, setLoginWarning] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('erfassung');
  const [tabVisible, setTabVisible] = useState<Record<TabId, boolean>>(INITIAL_TAB_VISIBLE);
  const [primedTabs, setPrimedTabs] = useState<ReadonlySet<TabId>>(new Set());
  const [selectedEmployeeId, setSelectedEmployeeIdState] = useState<string | null>(null);

  // Refs so async data-layer functions always see current values.
  const userRef = useRef(user);
  const roleRef = useRef(role);
  const householdIdRef = useRef(householdId);
  const dataRef = useRef(data);
  const activeTabRef = useRef(activeTab);
  const tabVisibleRef = useRef(tabVisible);
  const selectedEmployeeIdRef = useRef(selectedEmployeeId);
  userRef.current = user;
  roleRef.current = role;
  householdIdRef.current = householdId;
  activeTabRef.current = activeTab;
  tabVisibleRef.current = tabVisible;
  selectedEmployeeIdRef.current = selectedEmployeeId;

  const setData = useCallback((updater: AppState | ((prev: AppState) => AppState)) => {
    setDataState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      dataRef.current = next;
      return next;
    });
  }, []);

  // Keep selectedEmployeeId valid. An employee-role user is pinned to their own
  // linked record; everyone else falls back to the first active employee.
  const ensureSelectedEmployee = useCallback(() => {
    const st = dataRef.current;
    const own = ownEmployeeOf(st, userRef.current?.id ?? null);
    if (roleRef.current === 'employee') {
      const next = own ? own.id : null;
      selectedEmployeeIdRef.current = next;
      setSelectedEmployeeIdState(next);
      return;
    }
    const actives = activeEmployees(st);
    if (!actives.some(e => e.id === selectedEmployeeIdRef.current)) {
      const next = (own && actives.some(e => e.id === own.id)) ? own.id
        : (actives[0] ? actives[0].id : null);
      selectedEmployeeIdRef.current = next;
      setSelectedEmployeeIdState(next);
    }
  }, []);

  const setSelectedEmployeeId = useCallback((id: string | null) => {
    selectedEmployeeIdRef.current = id;
    setSelectedEmployeeIdState(id);
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
    const [profileRes, shiftsRes, settingsRes, householdRes, employeesRes, wagesRes] = await Promise.all([
      supabase.from('household_profile').select('*').eq('household_id', hh).maybeSingle(),
      supabase.from('shifts').select('id, date, hours, note, entered_by, employee_id').eq('household_id', hh).order('date'),
      supabase.from('pay_settings').select('id, effective_month, data').eq('household_id', hh).order('effective_month'),
      supabase.from('households').select('name').eq('id', hh).maybeSingle(),
      supabase.from('employees').select('id, data, user_id, archived_at').eq('household_id', hh).order('created_at'),
      // employee_wages has no household_id; RLS already scopes rows to this household.
      supabase.from('employee_wages').select('id, employee_id, effective_month, hourly_rate, monthly_salary').order('effective_month')
    ]);
    if (profileRes.error) throw profileRes.error;
    if (shiftsRes.error) throw shiftsRes.error;
    if (settingsRes.error) throw settingsRes.error;
    if (householdRes.error) throw householdRes.error;
    if (employeesRes.error) throw employeesRes.error;
    if (wagesRes.error) throw wagesRes.error;

    const profileRow = (profileRes.data || {}) as { employer?: unknown };
    const wages: Record<string, unknown[]> = {};
    for (const w of (wagesRes.data || [])) {
      (wages[w.employee_id] = wages[w.employee_id] || []).push({
        id: w.id, effectiveMonth: w.effective_month,
        hourlyRate: w.hourly_rate == null ? 0 : Number(w.hourly_rate),
        monthlySalary: w.monthly_salary == null ? 0 : Number(w.monthly_salary)
      });
    }
    setData(sanitizeState({
      householdName: householdRes.data?.name,
      employer: profileRow.employer,
      employees: (employeesRes.data || []).map(r => ({
        id: r.id, data: r.data, userId: r.user_id, archivedAt: r.archived_at
      })),
      wages,
      paySettings: (settingsRes.data || []).map(r => ({
        id: r.id,
        effectiveMonth: r.effective_month,
        data: r.data
      })),
      shifts: (shiftsRes.data || []).map(r => ({
        id: r.id, date: r.date, hours: r.hours == null ? null : Number(r.hours),
        note: r.note || '', entered_by: r.entered_by, employeeId: r.employee_id
      }))
    }));
    ensureSelectedEmployee();
  }, [ensureSelectedEmployee, setData]);

  const loadMembers = useCallback(async (hh: string): Promise<Member[]> => {
    const { data: rows, error } = await supabase.rpc('members_of_household', { h: hh });
    if (error) throw error;
    const list = (rows || []) as Member[];
    setMembers(new Map(list.map(m => [m.user_id, m])));
    return list;
  }, []);

  const reloadInvites = useCallback(async (): Promise<OpenInvite[]> => {
    const { data: rows, error } = await supabase
      .from('invites')
      .select('id, email, role, employee_id, token, created_at, accepted_at')
      .eq('household_id', householdIdRef.current)
      .is('accepted_at', null);
    if (error) throw error;
    const list: OpenInvite[] = (rows || []).map(i => ({
      id: i.id, email: i.email, role: i.role,
      employeeId: i.employee_id, token: i.token, createdAt: i.created_at
    }));
    setOpenInvites(list);
    return list;
  }, []);

  const applyRoleVisibility = useCallback((r: Role) => {
    const employeeAllowed: TabId[] = ['erfassung'];
    const adminAllowed: TabId[] = ['erfassung', 'monat', 'jahr', 'stammdaten', 'mitarbeitende', 'einstellungen', 'info'];
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

    // Link invite: consume any pending ?invite=<token> before resolving the
    // membership, so a user who registered through the link is already a member
    // of the invited household when we fetch it. For a brand-new signup the
    // handle_new_user trigger has usually consumed the token already (metadata
    // path) — this RPC then just returns null. Best-effort: a failure here must
    // not block sign-in.
    const inviteToken = getPendingInviteToken();
    if (inviteToken) {
      try {
        await supabase.rpc('accept_invite_by_token', { p_token: inviteToken });
      } catch (e) {
        console.warn('[invite] accept_invite_by_token failed:', e);
      }
      clearPendingInviteToken();
    }

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
      try { await reloadInvites(); } catch (e) { console.warn(e); }
    }

    setUi({ login: false, create: false, strip: true, invite: null });
    applyRoleVisibility(r);
    // onSignedIn calls renderEntries() + renderPaySettingsTab() in the vanilla app.
    setPrimedTabs(prev => new Set([...prev, 'erfassung' as TabId, 'einstellungen' as TabId]));
    setSyncStatus('ok');
  }, [applyRoleVisibility, fetchMembership, fetchPendingInvite, loadFromCloud, loadMembers, reloadInvites, setSyncStatus, showLogin]);

  const refreshSignedIn = useCallback(async () => {
    const u = userRef.current;
    if (u) await onSignedIn(u);
  }, [onSignedIn]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Arrived via a recovery link — show the set-password overlay on top
        // of whatever the signed-in flow renders behind it.
        setRecoveryMode(true);
      } else if (event === 'SIGNED_IN' && session && session.user) {
        onSignedIn(session.user);
      } else if (event === 'SIGNED_OUT') {
        userRef.current = null;
        householdIdRef.current = null;
        roleRef.current = null;
        setUser(null);
        setHouseholdId(null);
        setRole(null);
        setMembers(new Map());
        setOpenInvites([]);
        setData(sanitizeState({}));
        showLogin();
      }
    });

    (async function bootstrap() {
      // Magic/invite links carry the OTP as ?token_hash=...&type=... in the query
      // and we verify it here in JS. The single-use token is therefore only spent
      // when a real browser runs this code — email scanners / link prefetchers that
      // merely GET the page (and Resend click-tracking) can't consume it, which
      // avoids the "otp_expired" error. See the send-invite-email Edge Function.
      const params = new URLSearchParams(location.search);
      const tokenHash = params.get('token_hash');
      const otpType = params.get('type');
      if (tokenHash && otpType) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType as 'magiclink' });
        history.replaceState(null, '', location.pathname); // strip the token from the URL
        if (error) {
          setLoginWarning(LOGIN_LINK_WARNING);
          showLogin();
          return;
        }
      } else if (hadAuthErrorInUrl) {
        // A failed Supabase verify redirect left #error=...&error_description=...
        // (captured and stripped at module scope in supabaseClient.ts).
        setLoginWarning(LOGIN_LINK_WARNING);
        showLogin();
        return;
      }

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
            updated_at: new Date().toISOString()
          });
        if (error) throw error;
        setSyncStatus('ok');
      } catch (e) {
        setSyncStatus('error', e);
      }
    }, 1000);
  }, [setSyncStatus]);

  /* ---- CLOUD SAVE: household name (debounced) ---- */
  // The household name drives the invitation email and the invite banner, so it
  // lives on the households table (not household_profile). Only owner/admin may
  // update it (RLS "admins update household").
  const householdNameSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistHouseholdName = useCallback(() => {
    const r = roleRef.current;
    if (r !== 'owner' && r !== 'admin') return;
    setSyncStatus('pending');
    if (householdNameSaveTimer.current) clearTimeout(householdNameSaveTimer.current);
    householdNameSaveTimer.current = setTimeout(async () => {
      try {
        const name = dataRef.current.householdName.trim();
        if (!name) { setSyncStatus('ok'); return; }
        const { error } = await supabase
          .from('households')
          .update({ name })
          .eq('id', householdIdRef.current);
        if (error) throw error;
        setSyncStatus('ok');
      } catch (e) {
        setSyncStatus('error', e);
      }
    }, 1000);
  }, [setSyncStatus]);

  const updateHouseholdName = useCallback((name: string) => {
    setData(prev => ({ ...prev, householdName: name }));
    persistHouseholdName();
  }, [persistHouseholdName, setData]);

  const updateEmployer = useCallback((patch: Partial<Employer>) => {
    setData(prev => ({ ...prev, employer: { ...prev.employer, ...patch } }));
    persistHouseholdProfile();
  }, [persistHouseholdProfile, setData]);

  /* ---- CLOUD SAVE: shifts ---- */
  const addShift = useCallback(async ({ date, hours, note, employeeId }: { date: string; hours: number | null; note: string; employeeId: string }) => {
    setSyncStatus('pending');
    try {
      const insert: Record<string, unknown> = {
        household_id: householdIdRef.current,
        date, hours, note,
        entered_by: userRef.current?.id
      };
      // Attribute to an employee. With a single active employee the DB trigger
      // would also fill it, but we set it explicitly whenever we know it.
      if (employeeId) insert.employee_id = employeeId;
      const { data: row, error } = await supabase
        .from('shifts')
        .insert(insert)
        .select()
        .single();
      if (error) throw error;
      setData(prev => ({
        ...prev,
        shifts: [...prev.shifts, {
          id: row.id, date: row.date, hours: row.hours == null ? null : Number(row.hours),
          note: row.note || '', entered_by: row.entered_by, employeeId: row.employee_id
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

  /* ---- CLOUD SAVE: employees ---- */
  const addEmployee = useCallback(async (empData: EmployeeData): Promise<string | null> => {
    setSyncStatus('pending');
    try {
      const { data: row, error } = await supabase
        .from('employees')
        .insert({ household_id: householdIdRef.current, data: empData })
        .select('id, data, user_id, archived_at')
        .single();
      if (error) throw error;
      setData(prev => ({
        ...prev,
        employees: [...prev.employees, { id: row.id, data: sanitizeEmployeeData(row.data), userId: row.user_id, archivedAt: row.archived_at }],
        wages: { ...prev.wages, [row.id]: prev.wages[row.id] || [] }
      }));
      ensureSelectedEmployee();
      setSyncStatus('ok');
      return row.id;
    } catch (e) { setSyncStatus('error', e); return null; }
  }, [ensureSelectedEmployee, setData, setSyncStatus]);

  const updateEmployee = useCallback(async (id: string, patch: { data?: EmployeeData; archived_at?: string | null }): Promise<boolean> => {
    setSyncStatus('pending');
    try {
      const { data: row, error } = await supabase
        .from('employees')
        .update(patch)
        .eq('id', id)
        .select('id, data, user_id, archived_at')
        .single();
      if (error) throw error;
      setData(prev => ({
        ...prev,
        employees: prev.employees.map(e => e.id === id
          ? { ...e, data: sanitizeEmployeeData(row.data), archivedAt: row.archived_at, userId: row.user_id }
          : e)
      }));
      ensureSelectedEmployee();
      setSyncStatus('ok');
      return true;
    } catch (e) { setSyncStatus('error', e); return false; }
  }, [ensureSelectedEmployee, setData, setSyncStatus]);

  /* ---- CLOUD SAVE: employee_wages ---- */
  // `kind` decides whether `amount` is an hourly rate or a monthly salary; the
  // other column stays NULL. The employee's employmentType picks the kind.
  const addWage = useCallback(async (employeeId: string, effectiveMonth: string, amount: number, kind: EmploymentType = 'hourly'): Promise<boolean> => {
    setSyncStatus('pending');
    try {
      const insert: Record<string, unknown> = { employee_id: employeeId, effective_month: effectiveMonth };
      if (kind === 'monthly') insert.monthly_salary = amount; else insert.hourly_rate = amount;
      const { data: row, error } = await supabase
        .from('employee_wages')
        .insert(insert)
        .select('id, employee_id, effective_month, hourly_rate, monthly_salary')
        .single();
      if (error) throw error;
      setData(prev => ({
        ...prev,
        wages: {
          ...prev.wages,
          [employeeId]: [...(prev.wages[employeeId] || []), {
            id: row.id, effectiveMonth: row.effective_month,
            hourlyRate: row.hourly_rate == null ? 0 : Number(row.hourly_rate),
            monthlySalary: row.monthly_salary == null ? 0 : Number(row.monthly_salary)
          }].sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth))
        }
      }));
      setSyncStatus('ok');
      return true;
    } catch (e) { setSyncStatus('error', e); return false; }
  }, [setData, setSyncStatus]);

  const updateWage = useCallback(async (employeeId: string, id: string, amount: number, kind: EmploymentType = 'hourly'): Promise<boolean> => {
    setSyncStatus('pending');
    try {
      const patch: Record<string, unknown> = kind === 'monthly' ? { monthly_salary: amount } : { hourly_rate: amount };
      const { data: row, error } = await supabase
        .from('employee_wages')
        .update(patch)
        .eq('id', id)
        .select('hourly_rate, monthly_salary')
        .single();
      if (error) throw error;
      setData(prev => ({
        ...prev,
        wages: {
          ...prev.wages,
          [employeeId]: (prev.wages[employeeId] || []).map(w => w.id === id ? {
            ...w,
            hourlyRate: row.hourly_rate == null ? 0 : Number(row.hourly_rate),
            monthlySalary: row.monthly_salary == null ? 0 : Number(row.monthly_salary)
          } : w)
        }
      }));
      setSyncStatus('ok');
      return true;
    } catch (e) { setSyncStatus('error', e); return false; }
  }, [setData, setSyncStatus]);

  const deleteWage = useCallback(async (employeeId: string, id: string): Promise<boolean> => {
    setSyncStatus('pending');
    try {
      const { error } = await supabase.from('employee_wages').delete().eq('id', id);
      if (error) throw error;
      setData(prev => ({
        ...prev,
        wages: { ...prev.wages, [employeeId]: (prev.wages[employeeId] || []).filter(w => w.id !== id) }
      }));
      setSyncStatus('ok');
      return true;
    } catch (e) { setSyncStatus('error', e); return false; }
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
      updated_at: new Date().toISOString()
    });
    if (profErr) throw profErr;
    // Order matters: FK + period-lock triggers. Drop dependents first
    // (shifts → employee_wages → pay_settings → employees), then re-insert in
    // dependency order, remapping employee ids from the imported file.
    for (const tbl of ['shifts', 'pay_settings']) {
      const { error } = await supabase.from(tbl).delete().eq('household_id', hh);
      if (error) throw error;
    }
    // employee_wages has no household_id; remove via the (still present) employees.
    const { data: oldEmps } = await supabase.from('employees').select('id').eq('household_id', hh);
    for (const oe of (oldEmps || [])) {
      await supabase.from('employee_wages').delete().eq('employee_id', oe.id);
    }
    await supabase.from('employees').delete().eq('household_id', hh);

    // Re-insert employees and build old-id → new-id map (old id is the file's
    // employee.id; entries without an id map by array index fallback).
    const idMap: Record<string, string> = {};
    for (let i = 0; i < fresh.employees.length; i++) {
      const emp = fresh.employees[i];
      const { data: row, error } = await supabase.from('employees')
        .insert({ household_id: hh, data: emp.data, archived_at: emp.archivedAt || null })
        .select('id').single();
      if (error) throw error;
      if (emp.id) idMap[emp.id] = row.id;
      idMap['__idx_' + i] = row.id;
    }
    if (fresh.paySettings.length) {
      const { error } = await supabase.from('pay_settings').insert(fresh.paySettings.map(v => ({
        household_id: hh, effective_month: v.effectiveMonth, data: v.data
      })));
      if (error) throw error;
    }
    // employee_wages, remapped to the new employee ids. A version is either an
    // hourly rate or a monthly salary — set the column that carries a value.
    const wageRows: Record<string, unknown>[] = [];
    for (const oldId of Object.keys(fresh.wages)) {
      const newId = idMap[oldId];
      if (!newId) continue;
      for (const w of fresh.wages[oldId]) {
        const isMonthly = w.monthlySalary > 0 && !(w.hourlyRate > 0);
        wageRows.push(isMonthly
          ? { employee_id: newId, effective_month: w.effectiveMonth, monthly_salary: w.monthlySalary }
          : { employee_id: newId, effective_month: w.effectiveMonth, hourly_rate: w.hourlyRate });
      }
    }
    if (wageRows.length) {
      const { error } = await supabase.from('employee_wages').insert(wageRows);
      if (error) throw error;
    }
    if (fresh.shifts.length) {
      const rows = fresh.shifts.map(e => {
        const row: Record<string, unknown> = { household_id: hh, date: e.date, hours: e.hours, note: e.note, entered_by: userRef.current?.id };
        if (e.employeeId && idMap[e.employeeId]) row.employee_id = idMap[e.employeeId];
        return row;
      });
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
      // Dependency order: shifts → employee_wages → pay_settings → employees.
      const { error: delShiftsErr } = await supabase.from('shifts').delete().eq('household_id', hh);
      if (delShiftsErr) throw delShiftsErr;
      // Re-query employees from the DB (not just local state) so wages of rows
      // added on another device are also removed before deleting the employees.
      const { data: allEmps } = await supabase.from('employees').select('id').eq('household_id', hh);
      for (const emp of (allEmps || [])) {
        await supabase.from('employee_wages').delete().eq('employee_id', emp.id);
      }
      const { error: delPsErr } = await supabase.from('pay_settings').delete().eq('household_id', hh);
      if (delPsErr) throw delPsErr;
      const { error: delEmpErr } = await supabase.from('employees').delete().eq('household_id', hh);
      if (delEmpErr) throw delEmpErr;
      const blank = sanitizeState({});
      const { error: profErr } = await supabase.from('household_profile').upsert({
        household_id: hh,
        employer: blank.employer,
        updated_at: new Date().toISOString()
      });
      if (profErr) throw profErr;
      setData(blank);
      ensureSelectedEmployee();
      setSyncStatus('ok');
    } catch (e) {
      setSyncStatus('error', e);
      throw e;
    }
  }, [ensureSelectedEmployee, setData, setSyncStatus]);

  /* ---- MITGLIEDER ---- */
  const loadMembersList = useCallback(async (): Promise<Member[]> => {
    return loadMembers(householdIdRef.current!);
  }, [loadMembers]);

  // Create an invite (optionally linked to an employee record so accepting it
  // links that employee's login) and trigger the invitation email.
  const createInvite = useCallback(async ({ email, role: invRole, employeeId }: { email: string; role: Role; employeeId?: string | null }): Promise<boolean> => {
    setSyncStatus('pending');
    try {
      const insert: Record<string, unknown> = { household_id: householdIdRef.current, email, role: invRole, invited_by: userRef.current?.id };
      if (employeeId) insert.employee_id = employeeId;
      const { data: inserted, error } = await supabase
        .from('invites').insert(insert).select('id').single();
      if (error) throw error;
      setSyncStatus('ok');

      // Fire-and-await the edge function that sends the actual email. We don't
      // want to block the UI on failure — if it errors we offer a mailto
      // fallback so the inviter can still notify the person.
      const { error: fnErr } = await supabase.functions.invoke(
        'send-invite-email',
        { body: { invite_id: inserted.id } }
      );
      if (fnErr) {
        console.warn('[invite] send-invite-email failed:', fnErr);
        const useMailto = confirm(
          'Einladung gespeichert, aber automatische E-Mail konnte nicht versendet werden.\n\n' +
            'Möchtest du eine E-Mail aus deinem Mail-Programm an ' + email + ' verfassen?'
        );
        if (useMailto) openInviteFallbackMail(email, invRole);
      } else {
        alert('Einladung an ' + email + ' versendet.');
      }
      return true;
    } catch (e) {
      setSyncStatus('error', e);
      return false;
    }
  }, [setSyncStatus]);

  // Create a URL invite (no email known) and return the shareable link. The
  // token is generated server-side by the create_link_invite RPC.
  const createLinkInvite = useCallback(async ({ role: invRole, employeeId }: { role: Role; employeeId?: string | null }): Promise<string | null> => {
    setSyncStatus('pending');
    try {
      const { data: token, error } = await supabase.rpc('create_link_invite', {
        p_role: invRole,
        p_employee_id: employeeId ?? null
      });
      if (error) throw error;
      setSyncStatus('ok');
      return `${location.origin}${location.pathname}?invite=${token}`;
    } catch (e) {
      setSyncStatus('error', e);
      return null;
    }
  }, [setSyncStatus]);

  const value = useMemo<AppContextValue>(() => ({
    user, role, householdId, members, openInvites, data, ui, sync,
    authError, setAuthError, loginWarning, setLoginWarning,
    recoveryMode, setRecoveryMode,
    activeTab, tabVisible, showTab, primedTabs,
    selectedEmployeeId, setSelectedEmployeeId,
    setSyncStatus, refreshSignedIn, hideInviteBanner,
    updateHouseholdName, updateEmployer, addShift, deleteShift,
    addEmployee, updateEmployee, addWage, updateWage, deleteWage,
    addPaySettings, updatePaySettings, deletePaySettings,
    importState, clearAll, loadMembersList, reloadInvites, createInvite, createLinkInvite
  }), [
    user, role, householdId, members, openInvites, data, ui, sync, authError, loginWarning,
    recoveryMode,
    activeTab, tabVisible, showTab, primedTabs, selectedEmployeeId, setSelectedEmployeeId,
    setSyncStatus, refreshSignedIn, hideInviteBanner,
    updateHouseholdName, updateEmployer, addShift, deleteShift,
    addEmployee, updateEmployee, addWage, updateWage, deleteWage,
    addPaySettings, updatePaySettings, deletePaySettings,
    importState, clearAll, loadMembersList, reloadInvites, createInvite, createLinkInvite
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function openInviteFallbackMail(email: string, role: string) {
  // Fallback when the edge function is unreachable / not configured. Opens
  // the user's mail client with a German message ready to send.
  const subject = 'Einladung — Salärli';
  const body =
    `Hallo,\n\n` +
    `du wurdest als ${role} zu unserem Haushalt in „Salärli" eingeladen.\n\n` +
    `Öffne dieses Tool und melde dich mit dieser E-Mail-Adresse (${email}) an, ` +
    `dann erscheint die Einladung automatisch:\n${location.origin}${location.pathname}\n\n` +
    `Danke!`;
  window.location.href =
    'mailto:' +
    encodeURIComponent(email) +
    '?subject=' +
    encodeURIComponent(subject) +
    '&body=' +
    encodeURIComponent(body);
}
