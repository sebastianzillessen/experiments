'use strict';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';

const SUPABASE_URL = window.__APP_CONFIG?.url;
const SUPABASE_KEY = window.__APP_CONFIG?.key;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  document.body.innerHTML = '<p style="font-family:system-ui;padding:24px">Konfiguration fehlt: <code>config.js</code> nicht geladen oder unvollst&auml;ndig.</p>';
  throw new Error('Missing window.__APP_CONFIG');
}
const LIMIT_VEREINFACHT = 22680; // CHF/Jahr brutto pro Person 2026

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, flowType: 'implicit' }
});

let currentUser = null;
let currentHouseholdId = null;
let currentRole = null; // 'owner' | 'admin' | 'employee'
let membersCache = new Map();

/* ---- DEFAULTS ---- */
// Ferienentschädigung is an employee-level entitlement: 4, 5 or 6 weeks map to
// a fixed Zuschlag on the gross hourly wage (Kanton Zürich / NAV Hauswirtschaft).
const VACATION_WEEKS_PERCENT = { 4: 8.33, 5: 10.63, 6: 13.04 };
function vacationPercentForWeeks(weeks) {
  return VACATION_WEEKS_PERCENT[weeks] ?? VACATION_WEEKS_PERCENT[4];
}

function defaultPaySettingsData() {
  return {
    hourlyRate: 30.00,
    holidayPercent: 3.59,    // Feiertagsentschädigung: 3.59 % entspricht 9 ZH-Feiertagen (NAV Hauswirtschaft)
    ahvIvEoEmployee: 5.30, ahvIvEoEmployer: 5.30,
    alvEmployee: 1.10,     alvEmployer: 1.10,
    fakEmployer: 1.025,
    withholdingTax: 5.00,
    adminFeeEmployer: 5.00,  // Verwaltungskosten: % der AHV/IV/EO-Beiträge (AN + AG)
    uvgEnabled: true,
    uvgBuEmployer: 0.505,
    uvgNbuEmployee: 1.432
  };
}

/* ---- SANITIZATION ---- */
const asString = v => typeof v === 'string' ? v : (v == null ? '' : String(v));
const asNumber = (v, fallback) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

function sanitizePaySettingsData(d) {
  d = (d && typeof d === 'object') ? d : {};
  const def = defaultPaySettingsData();
  return {
    hourlyRate:       asNumber(d.hourlyRate,       def.hourlyRate),
    holidayPercent:   asNumber(d.holidayPercent,   def.holidayPercent),
    ahvIvEoEmployee:  asNumber(d.ahvIvEoEmployee,  def.ahvIvEoEmployee),
    ahvIvEoEmployer:  asNumber(d.ahvIvEoEmployer,  def.ahvIvEoEmployer),
    alvEmployee:      asNumber(d.alvEmployee,      def.alvEmployee),
    alvEmployer:      asNumber(d.alvEmployer,      def.alvEmployer),
    fakEmployer:      asNumber(d.fakEmployer,      def.fakEmployer),
    withholdingTax:   asNumber(d.withholdingTax,   def.withholdingTax),
    adminFeeEmployer: asNumber(d.adminFeeEmployer, def.adminFeeEmployer),
    uvgEnabled:       d.uvgEnabled === undefined ? def.uvgEnabled : !!d.uvgEnabled,
    uvgBuEmployer:    asNumber(d.uvgBuEmployer,    def.uvgBuEmployer),
    uvgNbuEmployee:   asNumber(d.uvgNbuEmployee,   def.uvgNbuEmployee)
  };
}

function sanitizeState(raw) {
  raw = (raw && typeof raw === 'object') ? raw : {};
  const er = (raw.employer && typeof raw.employer === 'object') ? raw.employer : {};
  const ee = (raw.employee && typeof raw.employee === 'object') ? raw.employee : {};
  const paySettings = Array.isArray(raw.paySettings)
    ? raw.paySettings.map(v => {
        if (!v || typeof v !== 'object') return null;
        const effectiveMonth = normalizeEffectiveMonth(v.effectiveMonth);
        if (!effectiveMonth) return null;
        return {
          id: asString(v.id) || null,
          effectiveMonth,
          data: sanitizePaySettingsData(v.data)
        };
      }).filter(Boolean)
        .sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth))
    : [];
  return {
    householdName: asString(raw.householdName),
    employer: {
      name:           asString(er.name),
      address:        asString(er.address),
      zip:            asString(er.zip),
      city:           asString(er.city),
      country:        asString(er.country) || 'CH',
      billingNumber:  asString(er.billingNumber)
    },
    employee: {
      name:           asString(ee.name),
      address:        asString(ee.address),
      zip:            asString(ee.zip),
      city:           asString(ee.city),
      country:        asString(ee.country) || 'CH',
      birthDate:      asString(ee.birthDate),
      ahvNumber:      asString(ee.ahvNumber),
      iban:           asString(ee.iban),
      weeklyHoursThreshold8h: !!ee.weeklyHoursThreshold8h,
      vacationWeeks:  [4, 5, 6].includes(Number(ee.vacationWeeks)) ? Number(ee.vacationWeeks) : 4
    },
    paySettings,
    shifts: Array.isArray(raw.shifts)
      ? raw.shifts.map(x => {
          if (!x || typeof x !== 'object') return null;
          const hours = asNumber(x.hours, NaN);
          const date = asString(x.date);
          if (!date || !Number.isFinite(hours) || hours <= 0) return null;
          return {
            id: asString(x.id),
            date, hours,
            note: asString(x.note),
            entered_by: asString(x.entered_by)
          };
        }).filter(Boolean)
      : []
  };
}

// Accept "YYYY-MM" or "YYYY-MM-DD"; return "YYYY-MM-01" or null on bad input.
function normalizeEffectiveMonth(value) {
  const s = asString(value);
  const m = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

let state = sanitizeState({});

/* ---- FORMATTERS ---- */
function fmtChf(n) {
  if (!isFinite(n)) n = 0;
  return n.toLocaleString('de-CH', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function round2(n) { return Math.round(n*100)/100; }

// Swiss Rappenrundung: payable amounts settle on the 5-Rappen grid. The SVA
// calculator rounds the wage components, the Bruttolohn and the Nettolohn this
// way, so we match it for those figures (contribution line items stay at
// Rappen precision, exactly as on the SVA breakdown).
function round5(n) { return Math.round(n*20)/20; }

function fmtDate(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// Display labels for the membership roles (DB values stay owner/admin/employee).
const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', employee: 'Mitarbeitende/r' };
function roleLabel(role) { return ROLE_LABELS[role] || role; }

function monthLabel(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  return `${months[m-1]} ${y}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---- PAY SETTINGS LOOKUP ---- */
// Returns the active pay_settings.data for a given ISO date string. Falls
// back to defaults when no version covers the date (no versions yet, or
// the date predates the earliest version).
function activePaySettingsFor(date) {
  const versions = state.paySettings;
  let active = null;
  for (const v of versions) {
    if (v.effectiveMonth <= date) active = v;
    else break;
  }
  return active ? active.data : defaultPaySettingsData();
}

// Find the version that owns a given ISO date (or null if no version covers it).
function activePaySettingsVersionFor(date) {
  const versions = state.paySettings;
  let active = null;
  for (const v of versions) {
    if (v.effectiveMonth <= date) active = v;
    else break;
  }
  return active;
}

// Returns true iff at least one shift falls within the effective period
// of `version` (i.e. between version.effectiveMonth and the next version's
// effectiveMonth, exclusive).
function versionHasShifts(version) {
  const idx = state.paySettings.findIndex(v => v.id === version.id);
  const next = state.paySettings[idx + 1];
  const start = version.effectiveMonth;
  const end = next ? next.effectiveMonth : null;
  return state.shifts.some(s => s.date >= start && (!end || s.date < end));
}

/* ---- BERECHNUNG ----
   Callers always pass the shifts of a single calendar month. Because
   pay_settings versions are effective from the first of a month and a new
   version cannot be inserted over months that already have shifts, exactly
   one version applies to all shifts of a given month — so a single rate set
   governs each Abrechnung. A future "Lohnerhöhung" via a new version cannot
   retroactively change past Lohnabrechnungen.

   We mirror the SVA Zürich calculator: the gross is built from Rappen-rounded
   components (Grundlohn, Ferien-, Feiertagszulage), each contribution is then
   computed on that rounded Bruttolohn at Rappen precision, and the Nettolohn
   (the actual payout) is rounded to the 5-Rappen grid. */
function berechneAbrechnung(shifts, employee) {
  let stundenTotal = 0, bruttoStundenRaw = 0;
  let nbuApplicable = false;
  let uvgAktivAny = false;
  // Active rate set for the month. Defaults cover the empty-shift case; the
  // loop overwrites it with the (single) version that applies to these shifts.
  let e = defaultPaySettingsData();

  for (const x of shifts) {
    e = activePaySettingsFor(x.date);
    const hours = Number(x.hours) || 0;
    stundenTotal += hours;
    bruttoStundenRaw += hours * e.hourlyRate;
    if (e.uvgEnabled) uvgAktivAny = true;
    if (e.uvgEnabled && employee.weeklyHoursThreshold8h) nbuApplicable = true;
  }

  // Ferienzulage is driven by the employee's Ferienanspruch (4/5/6 weeks),
  // not by the versioned pay_settings.
  const vacationPercent = vacationPercentForWeeks(employee.vacationWeeks);

  stundenTotal = round2(stundenTotal);
  const bruttoStunden   = round5(bruttoStundenRaw);
  const ferienzulage    = round5(bruttoStundenRaw * vacationPercent / 100);
  const feiertagszulage = round5(bruttoStundenRaw * e.holidayPercent / 100);
  const bruttoTotal     = round5(bruttoStunden + ferienzulage + feiertagszulage);

  const an = {
    ahvIvEo:   round2(bruttoTotal * e.ahvIvEoEmployee / 100),
    alv:       round2(bruttoTotal * e.alvEmployee / 100),
    nbu:       nbuApplicable ? round2(bruttoTotal * e.uvgNbuEmployee / 100) : 0,
    quellenst: round2(bruttoTotal * e.withholdingTax / 100)
  };
  an.total = round2(an.ahvIvEo + an.alv + an.nbu + an.quellenst);
  const netto = round5(bruttoTotal - an.total);

  // Verwaltungskosten der SVA werden in % der AHV/IV/EO-Beiträge (AN + AG) berechnet.
  const ahvIvEoBeitraege = bruttoTotal * (e.ahvIvEoEmployee + e.ahvIvEoEmployer) / 100;
  const ag = {
    ahvIvEo: round2(bruttoTotal * e.ahvIvEoEmployer / 100),
    alv:     round2(bruttoTotal * e.alvEmployer / 100),
    fak:     round2(bruttoTotal * e.fakEmployer / 100),
    bu:      uvgAktivAny ? round2(bruttoTotal * e.uvgBuEmployer / 100) : 0,
    verw:    round2(ahvIvEoBeitraege * e.adminFeeEmployer / 100)
  };
  ag.total = round2(ag.ahvIvEo + ag.alv + ag.fak + ag.bu + ag.verw);
  const agKostenTotal = round2(bruttoTotal + ag.total);

  return { stundenTotal, bruttoStunden, ferienzulage, feiertagszulage, bruttoTotal, an, netto, ag, agKostenTotal, nbuApplicable, uvgAktivAny };
}

/* ---- SYNC STATUS ---- */
const syncStatusEl = document.getElementById('sync-status');
const syncStatusText = document.getElementById('sync-status-text');
const syncWarnEl = document.getElementById('sync-warn');

function setSyncStatus(s, errMsg) {
  if (!syncStatusEl) return;
  syncStatusEl.hidden = false;
  syncStatusEl.dataset.state = s;
  const labels = { ok: 'Synchronisiert', pending: 'Speichern …', error: 'Fehler' };
  syncStatusText.textContent = labels[s] || 'Bereit';
  if (s === 'error') showSyncError(errMsg);
  else clearSyncError();
}

function showSyncError(err) {
  if (!syncWarnEl) return;
  const message = err && err.message ? err.message : (err || 'unbekannter Fehler');
  syncWarnEl.textContent = 'Synchronisation fehlgeschlagen: ' + message;
  syncWarnEl.hidden = false;
  console.warn('sync error', err);
}

function clearSyncError() {
  if (syncWarnEl) syncWarnEl.hidden = true;
}

/* ---- AUTH UI ---- */
const loginScreen = document.getElementById('login-screen');
const userStrip = document.getElementById('user-strip');
const userStripName = document.getElementById('user-strip-name');
const inviteBanner = document.getElementById('invite-banner');
const inviteText = document.getElementById('invite-text');
const authError = document.getElementById('auth-error');
const authInfo = document.getElementById('auth-info');
const loginWarning = document.getElementById('login-warning');

// Prominent banner on the login screen, e.g. for an expired/invalid magic link.
function showLoginWarning(msg) {
  if (!loginWarning) return;
  loginWarning.textContent = msg;
  loginWarning.hidden = false;
}
function clearLoginWarning() {
  if (loginWarning) loginWarning.hidden = true;
}
const createHouseholdScreen = document.getElementById('create-household-screen');
const createHouseholdNameInput = document.getElementById('create-household-name');
const createHouseholdError = document.getElementById('create-household-error');
const btnCreateHousehold = document.getElementById('btn-create-household');

function showLogin() {
  loginScreen.hidden = false;
  userStrip.hidden = true;
  syncStatusEl.hidden = true;
  inviteBanner.hidden = true;
  createHouseholdScreen.hidden = true;
}

function hideLogin() {
  loginScreen.hidden = true;
  userStrip.hidden = false;
}

function showCreateHousehold(user) {
  loginScreen.hidden = true;
  inviteBanner.hidden = true;
  syncStatusEl.hidden = true;
  userStrip.hidden = true;
  createHouseholdScreen.hidden = false;
  createHouseholdError.hidden = true;
  if (createHouseholdNameInput && !createHouseholdNameInput.value) {
    const guess = (user && user.email) ? user.email.split('@')[0] : '';
    createHouseholdNameInput.value = guess ? `${guess} Haushalt` : 'Mein Haushalt';
  }
  setTimeout(() => createHouseholdNameInput && createHouseholdNameInput.focus(), 50);
}

document.getElementById('magic-link-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  authError.hidden = true;
  authInfo.hidden = true;
  clearLoginWarning();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    authError.textContent = 'Bitte gültige E-Mail-Adresse eingeben.';
    authError.hidden = false;
    return;
  }
  const submitBtn = document.getElementById('btn-magic-link');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Wird gesendet …';
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.href }
    });
    if (error) throw error;
    authInfo.textContent = `Anmelde-Link an ${email} gesendet. Bitte Posteingang prüfen (auch Spam).`;
    authInfo.hidden = false;
  } catch (e) {
    authError.textContent = 'Senden fehlgeschlagen: ' + (e.message || e);
    authError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Anmelde-Link senden';
  }
});

document.getElementById('btn-signout').addEventListener('click', async () => {
  await supabase.auth.signOut();
});

document.getElementById('create-household-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  createHouseholdError.hidden = true;
  const name = createHouseholdNameInput.value.trim();
  if (!name) {
    createHouseholdError.textContent = 'Bitte einen Namen eingeben.';
    createHouseholdError.hidden = false;
    return;
  }
  btnCreateHousehold.disabled = true;
  btnCreateHousehold.textContent = 'Wird angelegt …';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    console.log('[create-household] session snapshot:', {
      hasSession: !!session,
      hasAccessToken: !!session?.access_token,
      userId: session?.user?.id,
      expiresAt: session?.expires_at
    });
    const { data: userCheck, error: userErr } = await supabase.auth.getUser();
    console.log('[create-household] server getUser:', { hasUser: !!userCheck?.user, error: userErr });
    if (userErr || !userCheck?.user) {
      throw new Error('Server akzeptiert die Sitzung nicht: ' + (userErr?.message || 'no user'));
    }
    const { data, error } = await supabase.rpc('create_household_for_self', { p_name: name });
    if (error) {
      console.error('[create-household] RPC error:', error);
      throw error;
    }
    console.log('[create-household] RPC ok, household_id:', data);
    createHouseholdScreen.hidden = true;
    if (currentUser) await onSignedIn(currentUser);
  } catch (e) {
    createHouseholdError.textContent = 'Anlegen fehlgeschlagen: ' + (e.message || e);
    createHouseholdError.hidden = false;
  } finally {
    btnCreateHousehold.disabled = false;
    btnCreateHousehold.textContent = 'Haushalt anlegen';
  }
});

document.getElementById('btn-create-household-signout').addEventListener('click', async () => {
  await supabase.auth.signOut();
});

/* ---- AUTH FLOW ---- */
async function bootstrap() {
  // Magic/invite links carry the OTP as ?token_hash=...&type=... in the query
  // and we verify it here in JS. The single-use token is therefore only spent
  // when a real browser runs this code — email scanners / link prefetchers that
  // merely GET the page (and Resend click-tracking) can't consume it, which
  // avoids the "otp_expired" error. See the send-invite-email Edge Function.
  const params = new URLSearchParams(location.search);
  const tokenHash = params.get('token_hash');
  const otpType = params.get('type');
  if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
    history.replaceState(null, '', location.pathname); // strip the token from the URL
    if (error) {
      showLoginWarning('Dein Anmelde-Link war ungültig oder ist abgelaufen. Bitte fordere unten einen neuen Link an.');
      showLogin();
      return;
    }
  } else if (location.hash.includes('error')) {
    // A failed Supabase verify redirect leaves #error=...&error_description=... .
    history.replaceState(null, '', location.pathname);
    showLoginWarning('Dein Anmelde-Link war ungültig oder ist abgelaufen. Bitte fordere unten einen neuen Link an.');
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
    authError.textContent = 'Sitzung abgelaufen. Bitte erneut anmelden.'
      + (verifyErr?.message ? ' (' + verifyErr.message + ')' : '');
    authError.hidden = false;
    showLogin();
    return;
  }
  await onSignedIn(verified.user);
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session && session.user) {
    onSignedIn(session.user);
  } else if (event === 'SIGNED_OUT') {
    currentUser = null;
    currentHouseholdId = null;
    currentRole = null;
    membersCache = new Map();
    state = sanitizeState({});
    showLogin();
  }
});

async function onSignedIn(user) {
  currentUser = user;
  userStripName.textContent = user.email;

  let membership = await fetchMembership();
  if (!membership) {
    const invite = await fetchPendingInvite();
    if (invite) {
      hideLogin();
      showInviteBanner(invite);
      return;
    }
    await new Promise(r => setTimeout(r, 800));
    membership = await fetchMembership();
  }

  if (!membership) {
    showCreateHousehold(currentUser);
    return;
  }

  currentHouseholdId = membership.household_id;
  currentRole = membership.role;

  try {
    await loadFromCloud();
  } catch (e) {
    setSyncStatus('error', e);
    showLogin();
    return;
  }

  if (currentRole === 'owner' || currentRole === 'admin') {
    try { await loadMembers(); } catch (e) { console.warn(e); }
  }

  hideLogin();
  applyRoleVisibility(currentRole);
  refreshFns.forEach(fn => fn());
  renderEntries();
  renderPaySettingsTab();
  setSyncStatus('ok');
}

async function fetchMembership() {
  const { data, error } = await supabase
    .from('memberships')
    .select('household_id, role, created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: true })
    .order('household_id', { ascending: true })
    .limit(1);
  if (error) { console.warn(error); return null; }
  return (data && data[0]) || null;
}

async function fetchPendingInvite() {
  const { data, error } = await supabase
    .from('invites')
    .select('id, household_id, role, households(name)')
    .ilike('email', currentUser.email)
    .is('accepted_at', null)
    .limit(1);
  if (error) { console.warn(error); return null; }
  return (data && data[0]) || null;
}

function showInviteBanner(invite) {
  const householdName = (invite.households && invite.households.name) || 'einem Haushalt';
  inviteText.textContent = `Du wurdest in „${householdName}“ als ${roleLabel(invite.role)} eingeladen.`;
  inviteBanner.hidden = false;

  document.getElementById('btn-accept-invite').onclick = async () => {
    setSyncStatus('pending');
    try {
      const { error } = await supabase.rpc('accept_invite', { invite_id: invite.id });
      if (error) throw error;
      inviteBanner.hidden = true;
      await onSignedIn(currentUser);
    } catch (e) {
      setSyncStatus('error', e);
    }
  };

  document.getElementById('btn-decline-invite').onclick = async () => {
    inviteBanner.hidden = true;
    await supabase.auth.signOut();
  };
}

/* ---- CLOUD LOAD ---- */
async function loadFromCloud() {
  const [profileRes, shiftsRes, settingsRes, householdRes] = await Promise.all([
    supabase.from('household_profile').select('*').eq('household_id', currentHouseholdId).maybeSingle(),
    supabase.from('shifts').select('id, date, hours, note, entered_by').eq('household_id', currentHouseholdId).order('date'),
    supabase.from('pay_settings').select('id, effective_month, data').eq('household_id', currentHouseholdId).order('effective_month'),
    supabase.from('households').select('name').eq('id', currentHouseholdId).maybeSingle()
  ]);
  if (profileRes.error) throw profileRes.error;
  if (shiftsRes.error) throw shiftsRes.error;
  if (settingsRes.error) throw settingsRes.error;
  if (householdRes.error) throw householdRes.error;

  const profileRow = profileRes.data || {};
  state = sanitizeState({
    householdName: householdRes.data?.name,
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
  });
}

/* ---- CLOUD SAVE: household_profile (debounced) ---- */
let profileSaveTimer = null;
function persistHouseholdProfile() {
  if (currentRole !== 'owner' && currentRole !== 'admin') return;
  setSyncStatus('pending');
  clearTimeout(profileSaveTimer);
  profileSaveTimer = setTimeout(async () => {
    try {
      const { error } = await supabase
        .from('household_profile')
        .upsert({
          household_id: currentHouseholdId,
          employer: state.employer,
          employee: state.employee,
          updated_at: new Date().toISOString()
        });
      if (error) throw error;
      setSyncStatus('ok');
    } catch (e) {
      setSyncStatus('error', e);
    }
  }, 1000);
}

/* ---- CLOUD SAVE: household name (debounced) ---- */
// The household name drives the invitation email and the invite banner, so it
// lives on the households table (not household_profile). Only owner/admin may
// update it (RLS "admins update household").
let householdNameSaveTimer = null;
function persistHouseholdName() {
  if (currentRole !== 'owner' && currentRole !== 'admin') return;
  setSyncStatus('pending');
  clearTimeout(householdNameSaveTimer);
  householdNameSaveTimer = setTimeout(async () => {
    try {
      const name = state.householdName.trim();
      if (!name) { setSyncStatus('ok'); return; }
      const { error } = await supabase
        .from('households')
        .update({ name })
        .eq('id', currentHouseholdId);
      if (error) throw error;
      setSyncStatus('ok');
    } catch (e) {
      setSyncStatus('error', e);
    }
  }, 1000);
}

/* ---- CLOUD SAVE: shifts ---- */
async function addShiftCloud({ date, hours, note }) {
  setSyncStatus('pending');
  try {
    const { data, error } = await supabase
      .from('shifts')
      .insert({
        household_id: currentHouseholdId,
        date, hours, note,
        entered_by: currentUser.id
      })
      .select()
      .single();
    if (error) throw error;
    state.shifts.push({
      id: data.id, date: data.date, hours: Number(data.hours),
      note: data.note || '', entered_by: data.entered_by
    });
    state.shifts.sort((a, b) => a.date.localeCompare(b.date));
    setSyncStatus('ok');
    renderEntries();
    renderPaySettingsTab(); // shift may now lock a pay_settings version
  } catch (e) { setSyncStatus('error', e); }
}

async function deleteShiftCloud(id) {
  setSyncStatus('pending');
  try {
    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) throw error;
    state.shifts = state.shifts.filter(x => x.id !== id);
    setSyncStatus('ok');
    renderEntries();
    renderPaySettingsTab(); // shift removal may unlock a version
  } catch (e) { setSyncStatus('error', e); }
}

/* ---- CLOUD SAVE: pay_settings ---- */
async function addPaySettingsCloud(effectiveMonth, data) {
  setSyncStatus('pending');
  try {
    const { data: row, error } = await supabase
      .from('pay_settings')
      .insert({
        household_id: currentHouseholdId,
        effective_month: effectiveMonth,
        data
      })
      .select()
      .single();
    if (error) throw error;
    state.paySettings.push({ id: row.id, effectiveMonth: row.effective_month, data: row.data });
    state.paySettings.sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
    setSyncStatus('ok');
    return true;
  } catch (e) {
    setSyncStatus('error', e);
    return false;
  }
}

async function updatePaySettingsCloud(id, data) {
  setSyncStatus('pending');
  try {
    const { data: row, error } = await supabase
      .from('pay_settings')
      .update({ data })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const v = state.paySettings.find(v => v.id === id);
    if (v) v.data = row.data;
    setSyncStatus('ok');
    return true;
  } catch (e) {
    setSyncStatus('error', e);
    return false;
  }
}

async function deletePaySettingsCloud(id) {
  setSyncStatus('pending');
  try {
    const { error } = await supabase.from('pay_settings').delete().eq('id', id);
    if (error) throw error;
    state.paySettings = state.paySettings.filter(v => v.id !== id);
    setSyncStatus('ok');
    return true;
  } catch (e) {
    setSyncStatus('error', e);
    return false;
  }
}

/* ---- TAB SWITCHING (ARIA tabs pattern, role-aware) ---- */
const tabButtons = document.querySelectorAll('nav button[role="tab"]');
const tabPanels  = document.querySelectorAll('section[role="tabpanel"]');

function showTab(id) {
  const btn = document.querySelector(`nav button[data-tab="${id}"]`);
  if (btn && btn.hidden) return;
  tabPanels.forEach(s => s.classList.toggle('active', s.id === id));
  tabButtons.forEach(b => {
    const active = b.dataset.tab === id;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
    b.tabIndex = active ? 0 : -1;
  });
  if (id === 'monat')         renderMonatTab();
  if (id === 'jahr')          renderJahrTab();
  if (id === 'erfassung')     renderEntries();
  if (id === 'einstellungen') renderPaySettingsTab();
  if (id === 'mitglieder')    renderMitglieder();
}

tabButtons.forEach((b, idx) => {
  b.addEventListener('click', () => showTab(b.dataset.tab));
  b.addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowRight' || e.key === 'End' ? 1
              : e.key === 'ArrowLeft'  || e.key === 'Home' ? -1
              : 0;
    if (!dir) return;
    e.preventDefault();
    let next = e.key === 'Home' ? 0
            : e.key === 'End'  ? tabButtons.length - 1
            : (idx + dir + tabButtons.length) % tabButtons.length;
    let safety = tabButtons.length;
    while (tabButtons[next].hidden && safety-- > 0) {
      next = (next + dir + tabButtons.length) % tabButtons.length;
    }
    const target = tabButtons[next];
    if (target.hidden) return;
    showTab(target.dataset.tab);
    target.focus();
  });
});

function applyRoleVisibility(role) {
  const employeeAllowed = ['erfassung'];
  const adminAllowed = ['erfassung','monat','jahr','stammdaten','einstellungen','info'];
  tabButtons.forEach(btn => {
    const tab = btn.dataset.tab;
    let visible;
    if (role === 'employee')   visible = employeeAllowed.includes(tab);
    else if (role === 'admin') visible = adminAllowed.includes(tab);
    else                       visible = true;
    btn.hidden = !visible;
  });
  // Hide the whole nav when only one tab is visible (e.g. an employee who
  // only ever sees Stundenerfassung) — a single-tab bar is just noise.
  const visibleTabs = Array.from(tabButtons).filter(b => !b.hidden).length;
  const navEl = document.querySelector('nav[role="tablist"]');
  if (navEl) navEl.hidden = visibleTabs <= 1;
  const userStripRole = document.getElementById('user-strip-role');
  userStripRole.textContent = roleLabel(role);
  userStripRole.className = 'role-badge ' + role;
  const activePanel = document.querySelector('section[role="tabpanel"].active');
  const activeId = activePanel ? activePanel.id : 'erfassung';
  const activeBtn = document.querySelector(`nav button[data-tab="${activeId}"]`);
  if (!activeBtn || activeBtn.hidden) showTab('erfassung');
}

/* ---- BIND FORM FIELDS ---- */
function bind(id, getter, setter, type, persist = persistHouseholdProfile) {
  const el = document.getElementById(id);
  const apply = () => {
    const v = getter();
    if (type === 'checkbox') el.checked = !!v;
    else el.value = v == null ? '' : v;
  };
  apply();
  const evtName = type === 'checkbox' ? 'change' : 'input';
  el.addEventListener(evtName, () => {
    let v = type === 'checkbox' ? el.checked : el.value;
    if (type === 'number') v = v === '' ? 0 : Number(v);
    setter(v);
    persist();
  });
  return apply;
}

const refreshFns = [];

function bindStammdaten() {
  refreshFns.push(bind('hh-name', () => state.householdName, v => state.householdName = v, 'text', persistHouseholdName));
  refreshFns.push(bind('ag-name',          () => state.employer.name,          v => state.employer.name = v));
  refreshFns.push(bind('ag-adresse',       () => state.employer.address,       v => state.employer.address = v));
  refreshFns.push(bind('ag-plz',           () => state.employer.zip,           v => state.employer.zip = v));
  refreshFns.push(bind('ag-ort',           () => state.employer.city,          v => state.employer.city = v));
  refreshFns.push(bind('ag-abrechnungsnr', () => state.employer.billingNumber, v => state.employer.billingNumber = v));

  refreshFns.push(bind('an-name',         () => state.employee.name,      v => state.employee.name = v));
  refreshFns.push(bind('an-adresse',      () => state.employee.address,   v => state.employee.address = v));
  refreshFns.push(bind('an-plz',          () => state.employee.zip,       v => state.employee.zip = v));
  refreshFns.push(bind('an-ort',          () => state.employee.city,      v => state.employee.city = v));
  refreshFns.push(bind('an-geburtsdatum', () => state.employee.birthDate, v => state.employee.birthDate = v));
  refreshFns.push(bind('an-ahvnr',        () => state.employee.ahvNumber, v => state.employee.ahvNumber = v));
  refreshFns.push(bind('an-iban',         () => state.employee.iban,      v => state.employee.iban = v));
  refreshFns.push(bind('an-8h',           () => state.employee.weeklyHoursThreshold8h, v => state.employee.weeklyHoursThreshold8h = v, 'checkbox'));
  refreshFns.push(bind('an-ferienwochen', () => state.employee.vacationWeeks, v => state.employee.vacationWeeks = v, 'number'));
}

/* ---- ERFASSUNG ---- */
const eDatum = document.getElementById('e-datum');
const eStunden = document.getElementById('e-stunden');
const eNotiz = document.getElementById('e-notiz');
eDatum.value = new Date().toISOString().slice(0,10);

document.getElementById('btn-add').addEventListener('click', async () => {
  const date = eDatum.value;
  const hours = Number(eStunden.value);
  const note = eNotiz.value.trim();
  if (!date) { alert('Bitte ein Datum eingeben.'); return; }
  if (!hours || hours <= 0) { alert('Bitte gültige Stundenzahl eingeben.'); return; }
  if (!currentHouseholdId) { alert('Nicht angemeldet.'); return; }
  await addShiftCloud({ date, hours, note });
  eStunden.value = '';
  eNotiz.value = '';
});

function renderEntries() {
  const list = document.getElementById('entries-list');
  if (!list) return;
  const userId = currentUser ? currentUser.id : null;
  const visible = currentRole === 'employee'
    ? state.shifts.filter(e => e.entered_by === userId)
    : state.shifts;

  if (!visible.length) {
    list.innerHTML = '<div class="empty-state">Noch keine Einsätze erfasst.</div>';
    return;
  }
  const showEnteredBy = currentRole === 'owner' || currentRole === 'admin';
  const enteredByLabel = (id) => {
    if (!id) return '–';
    if (id === userId) return 'Du';
    const m = membersCache.get(id);
    if (!m) return '–';
    return m.full_name || m.email || '–';
  };
  const rows = visible.map(e => {
    const lohn = activePaySettingsFor(e.date).hourlyRate;
    const betrag = round2(e.hours * lohn);
    const canDelete = currentRole !== 'employee' || e.entered_by === userId;
    const delBtn = canDelete ? `<button class="btn btn-small btn-danger" data-del="${e.id}">Löschen</button>` : '';
    const enteredCell = showEnteredBy ? `<td>${escapeHtml(enteredByLabel(e.entered_by))}</td>` : '';
    return `<tr>
      <td>${fmtDate(e.date)}</td>
      ${enteredCell}
      <td>${e.note ? escapeHtml(e.note) : '<span class="muted">–</span>'}</td>
      <td class="num">${e.hours.toLocaleString('de-CH')}</td>
      <td class="num">CHF ${fmtChf(lohn)}</td>
      <td class="num">CHF ${fmtChf(betrag)}</td>
      <td class="actions">${delBtn}</td>
    </tr>`;
  }).join('');
  const totalH = visible.reduce((s,e) => s + e.hours, 0);
  const totalB = round2(visible.reduce((s,e) => s + e.hours * activePaySettingsFor(e.date).hourlyRate, 0));
  const enteredHead = showEnteredBy ? '<th>Erfasst von</th>' : '';
  const totalColspan = showEnteredBy ? 3 : 2;
  list.innerHTML = `<table>
    <thead><tr><th>Datum</th>${enteredHead}<th>Notiz</th><th class="num">Stunden</th><th class="num">Stundenlohn</th><th class="num">Betrag</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row"><td colspan="${totalColspan}">Total</td><td class="num">${totalH.toLocaleString('de-CH')}</td><td></td><td class="num">CHF ${fmtChf(totalB)}</td><td></td></tr></tfoot>
  </table>`;
  list.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Eintrag wirklich löschen?')) return;
      await deleteShiftCloud(btn.dataset.del);
    });
  });
}

/* ---- MONATSABRECHNUNG ---- */
const mInput = document.getElementById('m-monat');
mInput.value = new Date().toISOString().slice(0,7);
mInput.addEventListener('input', renderMonatTab);

function renderMonatTab() {
  const yyyymm = mInput.value;
  const target = document.getElementById('monat-doc');
  if (!yyyymm) { target.innerHTML = ''; return; }
  const eintraege = state.shifts.filter(e => e.date.startsWith(yyyymm));
  target.innerHTML = renderLohnabrechnung(eintraege, yyyymm);
  // Fill the QR-bill slot (if any) asynchronously — the lib loads lazily.
  const calc = berechneAbrechnung(eintraege, state.employee);
  injectQrBill(yyyymm, calc.netto);
}

// Render a Swiss QR-bill (QR-Rechnung) into the monthly doc so the employer
// can scan it to pay the Nettolohn. Creditor = employee (IBAN holder), debtor
// = employer. Loaded lazily from a CDN so a load failure never breaks the app.
async function injectQrBill(yyyymm, netto) {
  const slot = document.getElementById('qr-bill-slot');
  if (!slot) return; // no IBAN registered → slot not rendered
  const ee = state.employee;
  const er = state.employer;
  const note = (msg) => { slot.innerHTML = `<div class="warn" style="margin:0;">${escapeHtml(msg)}</div>`; };

  if (!(netto > 0)) { note('QR-Einzahlungsschein wird ab einem Nettolohn über CHF 0.00 erzeugt.'); return; }
  const iban = ee.iban.replace(/\s+/g, '').toUpperCase();
  if (!/^(CH|LI)\d{2}[0-9A-Z]{17}$/.test(iban)) {
    note('QR-Einzahlungsschein nur mit einer Schweizer/Liechtensteiner IBAN (CH/LI) möglich.');
    return;
  }
  if (!ee.zip || !ee.city || !ee.name) { note('Für den QR-Einzahlungsschein bitte Name, PLZ und Ort der Arbeitnehmer/in in den Stammdaten ergänzen.'); return; }
  if (!er.zip || !er.city || !er.name) { note('Für den QR-Einzahlungsschein bitte Name, PLZ und Ort der Arbeitgeber/in in den Stammdaten ergänzen.'); return; }

  try {
    const { SwissQRBill } = await import('https://esm.sh/swissqrbill@4/svg');
    const data = {
      currency: 'CHF',
      amount: round2(netto),
      message: `Lohn ${monthLabel(yyyymm)}`,
      creditor: {
        account: iban,
        name: ee.name, address: ee.address || ee.city, zip: ee.zip, city: ee.city, country: ee.country || 'CH'
      },
      debtor: {
        name: er.name, address: er.address || er.city, zip: er.zip, city: er.city, country: er.country || 'CH'
      }
    };
    const bill = new SwissQRBill(data);
    slot.innerHTML = '';
    slot.appendChild(bill.element);
  } catch (e) {
    console.warn('QR-bill generation failed', e);
    note('QR-Einzahlungsschein konnte nicht erzeugt werden (IBAN/Adresse prüfen).');
  }
}

function renderLohnabrechnung(eintraege, yyyymm) {
  const er = state.employer;
  const ee = state.employee;
  const calc = berechneAbrechnung(eintraege, ee);

  if (!eintraege.length) {
    return `<div class="empty-state">Keine Einsätze in ${escapeHtml(monthLabel(yyyymm))} erfasst.</div>`;
  }

  // Use the rates of the latest shift in the period for label percentages.
  // Per-shift amounts in `calc` are correct even if rates vary within a month.
  const sorted = [...eintraege].sort((a, b) => a.date.localeCompare(b.date));
  const e = activePaySettingsFor(sorted[sorted.length - 1].date);

  const stundenRows = sorted.map(x => {
    const xE = activePaySettingsFor(x.date);
    return `
    <tr>
      <td>${fmtDate(x.date)}</td>
      <td>${x.note ? escapeHtml(x.note) : ''}</td>
      <td class="num">${x.hours.toLocaleString('de-CH')}</td>
      <td class="num">CHF ${fmtChf(xE.hourlyRate)}</td>
      <td class="num">CHF ${fmtChf(round2(x.hours * xE.hourlyRate))}</td>
    </tr>`;
  }).join('');

  const nbuLine = calc.nbuApplicable
    ? `<div class="summary-row"><span>– UVG-NBU (${e.uvgNbuEmployee} %)</span><span>CHF ${fmtChf(calc.an.nbu)}</span></div>`
    : '';

  const buLine = calc.uvgAktivAny
    ? `<div class="summary-row"><span>UVG-BU (${e.uvgBuEmployer} %)</span><span>CHF ${fmtChf(calc.ag.bu)}</span></div>`
    : '';

  return `<div class="print-doc">
    <div class="doc-header">
      <div class="party">
        <div class="label-small">Arbeitgeber/in</div>
        <div class="name">${escapeHtml(er.name) || '<span class="muted">(Stammdaten ergänzen)</span>'}</div>
        <div>${escapeHtml(er.address)}</div>
        ${(er.zip || er.city) ? `<div>${escapeHtml(`${er.zip} ${er.city}`.trim())}</div>` : ''}
        ${er.billingNumber ? `<div class="muted">SVA-Abr.-Nr.: ${escapeHtml(er.billingNumber)}</div>` : ''}
      </div>
      <div class="party" style="text-align:right;">
        <div class="label-small">Arbeitnehmer/in</div>
        <div class="name">${escapeHtml(ee.name) || '<span class="muted">(Stammdaten ergänzen)</span>'}</div>
        <div>${escapeHtml(ee.address)}</div>
        ${(ee.zip || ee.city) ? `<div>${escapeHtml(`${ee.zip} ${ee.city}`.trim())}</div>` : ''}
        ${ee.ahvNumber ? `<div class="muted">AHV-Nr.: ${escapeHtml(ee.ahvNumber)}</div>` : ''}
      </div>
    </div>

    <div class="doc-title">
      <h1>Lohnabrechnung Privathaushalt</h1>
      <div class="period">${escapeHtml(monthLabel(yyyymm))}</div>
    </div>

    <h4>Geleistete Stunden</h4>
    <table>
      <thead><tr><th>Datum</th><th>Notiz</th><th class="num">Stunden</th><th class="num">Stundenlohn</th><th class="num">Betrag</th></tr></thead>
      <tbody>${stundenRows}</tbody>
      <tfoot><tr class="total-row"><td colspan="2">Total</td><td class="num">${calc.stundenTotal.toLocaleString('de-CH')}</td><td></td><td class="num">CHF ${fmtChf(calc.bruttoStunden)}</td></tr></tfoot>
    </table>

    <h4>Bruttolohn</h4>
    <div class="summary-row"><span>Stundenlohn-Summe</span><span>CHF ${fmtChf(calc.bruttoStunden)}</span></div>
    <div class="summary-row"><span>+ Ferienzulage (${ee.vacationWeeks} Wochen, ${vacationPercentForWeeks(ee.vacationWeeks)} %)</span><span>CHF ${fmtChf(calc.ferienzulage)}</span></div>
    <div class="summary-row"><span>+ Feiertagszulage (${e.holidayPercent} %)</span><span>CHF ${fmtChf(calc.feiertagszulage)}</span></div>
    <div class="summary-row total"><span>Bruttolohn</span><span>CHF ${fmtChf(calc.bruttoTotal)}</span></div>

    <h4>Abzüge Arbeitnehmer/in</h4>
    <div class="summary-row"><span>– AHV/IV/EO (${e.ahvIvEoEmployee} %)</span><span>CHF ${fmtChf(calc.an.ahvIvEo)}</span></div>
    <div class="summary-row"><span>– ALV (${e.alvEmployee} %)</span><span>CHF ${fmtChf(calc.an.alv)}</span></div>
    ${nbuLine}
    <div class="summary-row"><span>– Quellensteuer (${e.withholdingTax} %)</span><span>CHF ${fmtChf(calc.an.quellenst)}</span></div>
    <div class="summary-row total"><span>Total Abzüge</span><span>CHF ${fmtChf(calc.an.total)}</span></div>

    <div class="summary-row netto"><span>Auszahlung netto</span><span>CHF ${fmtChf(calc.netto)}</span></div>

    <h4>Arbeitgeberbeiträge (informativ, nicht vom Lohn abgezogen)</h4>
    <div class="summary-row"><span>AHV/IV/EO (${e.ahvIvEoEmployer} %)</span><span>CHF ${fmtChf(calc.ag.ahvIvEo)}</span></div>
    <div class="summary-row"><span>ALV (${e.alvEmployer} %)</span><span>CHF ${fmtChf(calc.ag.alv)}</span></div>
    <div class="summary-row"><span>FAK (${e.fakEmployer} %)</span><span>CHF ${fmtChf(calc.ag.fak)}</span></div>
    ${buLine}
    <div class="summary-row"><span>Verwaltungskosten (${e.adminFeeEmployer} % der AHV/IV/EO-Beiträge)</span><span>CHF ${fmtChf(calc.ag.verw)}</span></div>
    <div class="summary-row total"><span>Total Arbeitgeberbeiträge</span><span>CHF ${fmtChf(calc.ag.total)}</span></div>
    <div class="summary-row total"><span>Total Arbeitgeberkosten (Brutto + AG-Beiträge)</span><span>CHF ${fmtChf(calc.agKostenTotal)}</span></div>

    <div class="footnote">
      Vereinfachtes Abrechnungsverfahren der SVA Zürich (${e.uvgEnabled ? 'VAVplus' : 'VAV'}). Quellensteuer und Sozialversicherungsbeiträge werden direkt mit der Ausgleichskasse abgerechnet. ${e.uvgEnabled ? 'Unfallversicherung über SVA Zürich.' : 'Unfallversicherung separat über privaten Versicherer.'}
    </div>

    <div class="signatures">
      <div class="sig">Ort, Datum &amp; Unterschrift Arbeitgeber/in</div>
      <div class="sig">Ort, Datum &amp; Unterschrift Arbeitnehmer/in (Empfangsbestätigung)</div>
    </div>
    ${ee.iban ? `
    <div class="qr-bill-section">
      <h4>Zahlung Nettolohn — QR-Einzahlungsschein</h4>
      <div class="muted" style="font-size:11px; margin-bottom:8px;">Im Banking-App scannen, um den Nettolohn von CHF ${fmtChf(calc.netto)} an ${escapeHtml(ee.name || 'die Arbeitnehmer/in')} zu überweisen.</div>
      <div id="qr-bill-slot"><div class="muted">QR-Einzahlungsschein wird geladen …</div></div>
    </div>` : ''}
  </div>`;
}

document.getElementById('btn-print-monat').addEventListener('click', () => printSection('monat'));

/* ---- JAHRESÜBERSICHT ---- */
const jInput = document.getElementById('j-jahr');
jInput.value = new Date().getFullYear();
jInput.addEventListener('input', renderJahrTab);

function renderJahrTab() {
  const jahr = Number(jInput.value);
  const target = document.getElementById('jahr-doc');
  if (!jahr) { target.innerHTML = ''; return; }
  const eintraege = state.shifts.filter(e => e.date.startsWith(String(jahr)));
  target.innerHTML = renderJahresuebersicht(eintraege, jahr);
}

function renderJahresuebersicht(eintraege, jahr) {
  const ee = state.employee;
  const er = state.employer;
  const uvgUsedAnywhere = eintraege.some(x => activePaySettingsFor(x.date).uvgEnabled);

  const monatsRows = [];
  let yJahresBrutto = 0, yJahresStunden = 0, yJahresNetto = 0, yJahresAG = 0, yJahresAN = 0;

  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const yyyymm = `${jahr}-${mm}`;
    const monatEintraege = eintraege.filter(x => x.date.startsWith(yyyymm));
    if (!monatEintraege.length) continue;
    const calc = berechneAbrechnung(monatEintraege, ee);
    yJahresStunden += calc.stundenTotal;
    yJahresBrutto += calc.bruttoTotal;
    yJahresNetto += calc.netto;
    yJahresAG += calc.ag.total;
    yJahresAN += calc.an.total;
    monatsRows.push(`<tr>
      <td>${monthLabel(yyyymm)}</td>
      <td class="num">${calc.stundenTotal.toLocaleString('de-CH')}</td>
      <td class="num">CHF ${fmtChf(calc.bruttoTotal)}</td>
      <td class="num">CHF ${fmtChf(calc.an.total)}</td>
      <td class="num">CHF ${fmtChf(calc.netto)}</td>
      <td class="num">CHF ${fmtChf(calc.ag.total)}</td>
    </tr>`);
  }

  yJahresBrutto = round2(yJahresBrutto);
  yJahresNetto = round2(yJahresNetto);
  yJahresAG = round2(yJahresAG);
  yJahresAN = round2(yJahresAN);
  yJahresStunden = round2(yJahresStunden);
  const agKostenTotal = round2(yJahresBrutto + yJahresAG);

  let warnung = '';
  if (yJahresBrutto > LIMIT_VEREINFACHT) {
    warnung = `<div class="danger">Bruttolohn übersteigt CHF ${fmtChf(LIMIT_VEREINFACHT)} — vereinfachte Abrechnung nicht mehr möglich. Wechsel zur ordentlichen Abrechnung erforderlich.</div>`;
  } else if (yJahresBrutto >= LIMIT_VEREINFACHT * 0.9) {
    warnung = `<div class="warn"><strong>Achtung:</strong> Schon ${Math.round(yJahresBrutto / LIMIT_VEREINFACHT * 100)} % der Jahresgrenze (CHF ${fmtChf(LIMIT_VEREINFACHT)}) erreicht. Restbudget für ${jahr}: CHF ${fmtChf(round2(LIMIT_VEREINFACHT - yJahresBrutto))}.</div>`;
  }

  if (!monatsRows.length) {
    return `<div class="empty-state">Keine Einsätze im Jahr ${jahr} erfasst.</div>`;
  }

  return `<div class="print-doc">
    <div class="doc-header">
      <div class="party">
        <div class="label-small">Arbeitgeber/in</div>
        <div class="name">${escapeHtml(er.name) || '<span class="muted">(Stammdaten)</span>'}</div>
        <div>${escapeHtml(er.address)}</div>
      </div>
      <div class="party" style="text-align:right;">
        <div class="label-small">Arbeitnehmer/in</div>
        <div class="name">${escapeHtml(ee.name) || '<span class="muted">(Stammdaten)</span>'}</div>
        ${ee.ahvNumber ? `<div class="muted">AHV-Nr.: ${escapeHtml(ee.ahvNumber)}</div>` : ''}
      </div>
    </div>

    <div class="doc-title">
      <h1>Jahresübersicht ${jahr}</h1>
      <div class="period">Vereinfachte Abrechnung Kanton Zürich</div>
    </div>

    ${warnung}

    <h4>Monatsübersicht</h4>
    <table>
      <thead><tr><th>Monat</th><th class="num">Stunden</th><th class="num">Brutto</th><th class="num">AN-Abzüge</th><th class="num">Netto</th><th class="num">AG-Beiträge</th></tr></thead>
      <tbody>${monatsRows.join('')}</tbody>
      <tfoot><tr class="total-row">
        <td>Total ${jahr}</td>
        <td class="num">${yJahresStunden.toLocaleString('de-CH')}</td>
        <td class="num">CHF ${fmtChf(yJahresBrutto)}</td>
        <td class="num">CHF ${fmtChf(yJahresAN)}</td>
        <td class="num">CHF ${fmtChf(yJahresNetto)}</td>
        <td class="num">CHF ${fmtChf(yJahresAG)}</td>
      </tr></tfoot>
    </table>

    <h4>Lohndeklaration SVA Zürich</h4>
    <div class="summary-row"><span>Bruttolohnsumme ${jahr}</span><span>CHF ${fmtChf(yJahresBrutto)}</span></div>
    <div class="summary-row"><span>Total Arbeitgeberbeiträge</span><span>CHF ${fmtChf(yJahresAG)}</span></div>
    <div class="summary-row total"><span>Total Arbeitgeberkosten</span><span>CHF ${fmtChf(agKostenTotal)}</span></div>

    <div class="info" style="margin-top:14px;">
      Den Bruttolohn von <strong>CHF ${fmtChf(yJahresBrutto)}</strong> bei der SVA Zürich als Lohndeklaration ${jahr} einreichen (Frist üblicherweise Ende Januar ${jahr+1}). Die Ausgleichskasse stellt anschliessend die Schlussrechnung über Sozialversicherungsbeiträge${uvgUsedAnywhere ? ', UVG-Prämien' : ''} und Quellensteuer.
    </div>
  </div>`;
}

document.getElementById('btn-print-jahr').addEventListener('click', () => printSection('jahr'));

/* ---- PRINT ---- */
function printSection(id) {
  tabPanels.forEach(s => s.classList.remove('printing'));
  const el = document.getElementById(id);
  el.classList.add('printing');
  const cleanup = () => {
    el.classList.remove('printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

/* ---- EINSTELLUNGEN-TAB: versionierte pay_settings ---- */
// Modes: { mode: 'list' } | { mode: 'edit', id, locked } | { mode: 'add' }
let paySettingsUi = { mode: 'list' };
let paySettingsDraft = null; // { effectiveMonth, data } while editing/adding

const psListEl       = () => document.getElementById('pay-settings-list');
const psEditPanel    = () => document.getElementById('pay-settings-edit-panel');
const psEditTitle    = () => document.getElementById('pay-settings-edit-title');
const psMonthInput   = () => document.getElementById('ps-month');
const psLockedWarn   = () => document.getElementById('ps-locked-warn');
const psBtnSave      = () => document.getElementById('btn-save-pay-settings');
const psBtnCancel    = () => document.getElementById('btn-cancel-pay-settings');
const psBtnDelete    = () => document.getElementById('btn-delete-pay-settings');
const psFormError    = () => document.getElementById('pay-settings-form-error');

const PS_NUMERIC_FIELDS = [
  ['ps-hourly-rate',       'hourlyRate',       0.01],
  ['ps-holiday-percent',   'holidayPercent',   0.01],
  ['ps-ahv-employee',      'ahvIvEoEmployee',  0.01],
  ['ps-ahv-employer',      'ahvIvEoEmployer',  0.01],
  ['ps-alv-employee',      'alvEmployee',      0.01],
  ['ps-alv-employer',      'alvEmployer',      0.01],
  ['ps-fak-employer',      'fakEmployer',      0.01],
  ['ps-admin-fee-employer','adminFeeEmployer', 0.01],
  ['ps-withholding-tax',   'withholdingTax',   0.01],
  ['ps-uvg-bu-employer',   'uvgBuEmployer',    0.001],
  ['ps-uvg-nbu-employee',  'uvgNbuEmployee',   0.001]
];

function renderPaySettingsTab() {
  // List
  const list = psListEl();
  if (!list) return;
  if (!state.paySettings.length) {
    list.innerHTML = '<div class="empty-state">Noch keine Sätze hinterlegt. Lege eine erste Version an, bevor du Lohnabrechnungen erstellst.</div>';
  } else {
    const rows = state.paySettings.map(v => {
      const locked = versionHasShifts(v);
      const monthYm = v.effectiveMonth.slice(0, 7);
      const summary = `Stundenlohn CHF ${fmtChf(v.data.hourlyRate)} · Feiertage ${v.data.holidayPercent} %${v.data.uvgEnabled ? ' · UVG' : ''}`;
      const lockHint = locked
        ? '<span class="muted" title="Einsätze in dieser Periode vorhanden">🔒 gesperrt</span>'
        : '';
      const editLabel = locked ? 'Anzeigen' : 'Bearbeiten';
      return `
        <div class="member-row">
          <div class="info-block">
            <div class="name">ab ${escapeHtml(monthLabel(monthYm))}</div>
            <div class="meta">${escapeHtml(summary)}</div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            ${lockHint}
            <button class="btn btn-small" data-edit-ps="${v.id}">${editLabel}</button>
          </div>
        </div>`;
    }).join('');
    list.innerHTML = rows;
    list.querySelectorAll('button[data-edit-ps]').forEach(btn => {
      btn.addEventListener('click', () => openEditPaySettings(btn.dataset.editPs));
    });
  }

  // Edit panel
  const panel = psEditPanel();
  if (paySettingsUi.mode === 'list') {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const draft = paySettingsDraft;
  const isAdd = paySettingsUi.mode === 'add';
  const locked = !!paySettingsUi.locked;

  psEditTitle().textContent = isAdd
    ? 'Neue Version anlegen'
    : (locked ? 'Version (gesperrt)' : 'Version bearbeiten');

  // Month input: editable only on add. On edit it stays disabled.
  const monthInput = psMonthInput();
  monthInput.value = draft.effectiveMonth.slice(0, 7);
  monthInput.disabled = !isAdd || locked;

  // Numeric/checkbox fields: disabled when locked
  for (const [domId, key] of PS_NUMERIC_FIELDS) {
    const el = document.getElementById(domId);
    el.value = draft.data[key];
    el.disabled = locked;
  }
  const uvgEl = document.getElementById('ps-uvg-enabled');
  uvgEl.checked = !!draft.data.uvgEnabled;
  uvgEl.disabled = locked;

  // Locked warning
  psLockedWarn().hidden = !locked;

  psBtnSave().hidden = locked;
  psBtnDelete().hidden = isAdd || locked;
  psFormError().hidden = true;
}

function openEditPaySettings(id) {
  const v = state.paySettings.find(x => x.id === id);
  if (!v) return;
  const locked = versionHasShifts(v);
  paySettingsUi = { mode: 'edit', id, locked };
  paySettingsDraft = {
    effectiveMonth: v.effectiveMonth,
    data: { ...v.data }
  };
  renderPaySettingsTab();
  psEditPanel().scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openAddPaySettings() {
  // Default month: month after the latest shift, or current month.
  const latestShiftDate = state.shifts.length ? state.shifts[state.shifts.length - 1].date : null;
  let defaultMonth;
  if (latestShiftDate) {
    const [y, m] = latestShiftDate.split('-').map(Number);
    const next = new Date(Date.UTC(y, m, 1));
    defaultMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
  } else {
    const now = new Date();
    defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
  // Prefill data from latest version, otherwise defaults.
  const latest = state.paySettings[state.paySettings.length - 1];
  paySettingsUi = { mode: 'add', locked: false };
  paySettingsDraft = {
    effectiveMonth: defaultMonth,
    data: latest ? { ...latest.data } : defaultPaySettingsData()
  };
  renderPaySettingsTab();
  psEditPanel().scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closePaySettingsEdit() {
  paySettingsUi = { mode: 'list' };
  paySettingsDraft = null;
  renderPaySettingsTab();
}

// Read all form fields back into the draft.
function collectDraftFromForm() {
  const monthVal = psMonthInput().value;
  const month = normalizeEffectiveMonth(monthVal);
  if (!month) {
    return { error: 'Bitte einen gültigen Monat wählen.' };
  }
  const data = { ...paySettingsDraft.data };
  for (const [domId, key] of PS_NUMERIC_FIELDS) {
    const el = document.getElementById(domId);
    const v = el.value === '' ? 0 : Number(el.value);
    if (!Number.isFinite(v) || v < 0) {
      return { error: `Ungültiger Wert in ${el.previousElementSibling?.textContent || domId}.` };
    }
    data[key] = v;
  }
  data.uvgEnabled = !!document.getElementById('ps-uvg-enabled').checked;
  return { effectiveMonth: month, data };
}

async function savePaySettings() {
  const formError = psFormError();
  formError.hidden = true;
  const result = collectDraftFromForm();
  if (result.error) {
    formError.textContent = result.error;
    formError.hidden = false;
    return;
  }
  const { effectiveMonth, data } = result;
  if (paySettingsUi.mode === 'add') {
    // Client-side preflight: shifts on or after effectiveMonth would be retroactively shifted.
    if (state.shifts.some(s => s.date >= effectiveMonth)) {
      formError.textContent = 'Es existieren bereits Einsätze am oder nach diesem Monat — die Sätze würden rückwirkend gelten. Bitte späteren Monat wählen.';
      formError.hidden = false;
      return;
    }
    // Conflict with existing version on the exact same month.
    if (state.paySettings.some(v => v.effectiveMonth === effectiveMonth)) {
      formError.textContent = 'Für diesen Monat existiert bereits eine Version.';
      formError.hidden = false;
      return;
    }
    const ok = await addPaySettingsCloud(effectiveMonth, data);
    if (ok) closePaySettingsEdit();
  } else {
    const ok = await updatePaySettingsCloud(paySettingsUi.id, data);
    if (ok) closePaySettingsEdit();
  }
}

async function deleteCurrentPaySettings() {
  if (!confirm('Diese Version wirklich löschen? (Nur möglich, solange keine Einsätze in der Periode liegen.)')) return;
  const ok = await deletePaySettingsCloud(paySettingsUi.id);
  if (ok) closePaySettingsEdit();
}

document.getElementById('btn-add-pay-settings').addEventListener('click', openAddPaySettings);
psBtnSave().addEventListener('click', savePaySettings);
psBtnCancel().addEventListener('click', closePaySettingsEdit);
psBtnDelete().addEventListener('click', deleteCurrentPaySettings);

/* ---- DATEN VERWALTEN (Einstellungen-Tab, owner/admin) ---- */
document.getElementById('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `salaerli-export-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
});

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!confirm('Aktuelle Daten überschreiben?')) return;
      const fresh = sanitizeState(parsed);
      setSyncStatus('pending');
      const { error: profErr } = await supabase.from('household_profile').upsert({
        household_id: currentHouseholdId,
        employer: fresh.employer,
        employee: fresh.employee,
        updated_at: new Date().toISOString()
      });
      if (profErr) throw profErr;
      // Order matters: triggers reject pay_settings changes while shifts cover the period.
      // Drop shifts first, then pay_settings, then re-insert pay_settings, then shifts.
      const { error: delShiftsErr } = await supabase.from('shifts').delete().eq('household_id', currentHouseholdId);
      if (delShiftsErr) throw delShiftsErr;
      const { error: delPsErr } = await supabase.from('pay_settings').delete().eq('household_id', currentHouseholdId);
      if (delPsErr) throw delPsErr;
      if (fresh.paySettings.length) {
        const psRows = fresh.paySettings.map(v => ({
          household_id: currentHouseholdId,
          effective_month: v.effectiveMonth,
          data: v.data
        }));
        const { error: insPsErr } = await supabase.from('pay_settings').insert(psRows);
        if (insPsErr) throw insPsErr;
      }
      if (fresh.shifts.length) {
        const rows = fresh.shifts.map(e => ({
          household_id: currentHouseholdId,
          date: e.date, hours: e.hours, note: e.note,
          entered_by: currentUser.id
        }));
        const { error: insErr } = await supabase.from('shifts').insert(rows);
        if (insErr) throw insErr;
      }
      await loadFromCloud();
      refreshFns.forEach(fn => fn());
      renderEntries();
      renderPaySettingsTab();
      setSyncStatus('ok');
      alert('Daten importiert.');
    } catch (err) {
      setSyncStatus('error', err);
      alert('Import fehlgeschlagen: ' + (err.message || err));
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
});

document.getElementById('btn-clear-all').addEventListener('click', async () => {
  if (!confirm('Wirklich ALLE Daten (Stammdaten, Einsätze, Sätze) löschen?')) return;
  if (!confirm('Sicher? Dies kann nicht rückgängig gemacht werden.')) return;
  setSyncStatus('pending');
  try {
    const { error: delShiftsErr } = await supabase.from('shifts').delete().eq('household_id', currentHouseholdId);
    if (delShiftsErr) throw delShiftsErr;
    const { error: delPsErr } = await supabase.from('pay_settings').delete().eq('household_id', currentHouseholdId);
    if (delPsErr) throw delPsErr;
    const blank = sanitizeState({});
    const { error: profErr } = await supabase.from('household_profile').upsert({
      household_id: currentHouseholdId,
      employer: blank.employer,
      employee: blank.employee,
      updated_at: new Date().toISOString()
    });
    if (profErr) throw profErr;
    state = blank;
    refreshFns.forEach(fn => fn());
    renderEntries();
    renderPaySettingsTab();
    closePaySettingsEdit();
    setSyncStatus('ok');
  } catch (e) {
    setSyncStatus('error', e);
  }
});

/* ---- MITGLIEDER ---- */
async function loadMembers() {
  const { data, error } = await supabase
    .rpc('members_of_household', { h: currentHouseholdId });
  if (error) throw error;
  membersCache = new Map((data || []).map(m => [m.user_id, m]));
  return data || [];
}

async function loadInvitesList() {
  const { data, error } = await supabase
    .from('invites')
    .select('id, email, role, created_at, accepted_at')
    .eq('household_id', currentHouseholdId)
    .is('accepted_at', null);
  if (error) throw error;
  return data || [];
}

async function renderMitglieder() {
  const membersList = document.getElementById('members-list');
  const invitesList = document.getElementById('invites-list');
  if (currentRole !== 'owner') {
    membersList.innerHTML = '<div class="empty-state">Nur für Owner.</div>';
    invitesList.innerHTML = '';
    return;
  }
  membersList.innerHTML = '<div class="empty-state">Lade …</div>';
  invitesList.innerHTML = '<div class="empty-state">Lade …</div>';
  try {
    const [members, invitesArr] = await Promise.all([loadMembers(), loadInvitesList()]);

    if (!members.length) {
      membersList.innerHTML = '<div class="empty-state">Keine Mitglieder.</div>';
    } else {
      membersList.innerHTML = members.map(m => {
        const isSelf = m.user_id === currentUser.id;
        const showRemove = m.role !== 'owner' && !isSelf;
        return `
          <div class="member-row">
            <div class="info-block">
              <div class="name">${escapeHtml(m.full_name || m.email)}</div>
              <div class="meta">${escapeHtml(m.email)}${isSelf ? ' · du' : ''}</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="role-badge ${m.role}">${escapeHtml(roleLabel(m.role))}</span>
              ${showRemove ? `<button class="btn btn-small btn-danger" data-remove="${m.user_id}">Entfernen</button>` : ''}
            </div>
          </div>`;
      }).join('');
      membersList.querySelectorAll('button[data-remove]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Mitglied wirklich entfernen?')) return;
          const userId = btn.dataset.remove;
          setSyncStatus('pending');
          try {
            // Privileged delete via security-definer RPC. A direct
            // delete().select() can't confirm the removal: the memberships
            // SELECT policy only exposes the caller's own row, so DELETE …
            // RETURNING comes back empty for another member and looks like a
            // failure. The RPC enforces owner-only and returns the row count.
            const { data, error } = await supabase.rpc('remove_member', {
              p_household_id: currentHouseholdId,
              p_user_id: userId
            });
            if (error) throw error;
            if (!data) {
              throw new Error(
                'Mitglied wurde nicht entfernt — evtl. bereits entfernt oder fehlende Rechte (nur Owner darf Mitglieder entfernen).'
              );
            }
            setSyncStatus('ok');
            renderMitglieder();
          } catch (e) { setSyncStatus('error', e); }
        });
      });
    }

    if (!invitesArr.length) {
      invitesList.innerHTML = '<div class="empty-state">Keine offenen Einladungen.</div>';
    } else {
      invitesList.innerHTML = invitesArr.map(i => `
        <div class="member-row">
          <div class="info-block">
            <div class="name">${escapeHtml(i.email)}</div>
            <div class="meta">eingeladen am ${fmtDate(i.created_at.slice(0,10))}</div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="role-badge ${i.role}">${escapeHtml(roleLabel(i.role))}</span>
            <button class="btn btn-small btn-danger" data-revoke="${i.id}">Zurückziehen</button>
          </div>
        </div>`).join('');
      invitesList.querySelectorAll('button[data-revoke]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Einladung zurückziehen?')) return;
          setSyncStatus('pending');
          try {
            const { error } = await supabase.from('invites').delete().eq('id', btn.dataset.revoke);
            if (error) throw error;
            setSyncStatus('ok');
            renderMitglieder();
          } catch (e) { setSyncStatus('error', e); }
        });
      });
    }
  } catch (e) {
    setSyncStatus('error', e);
    membersList.innerHTML = '<div class="empty-state">Fehler beim Laden.</div>';
    invitesList.innerHTML = '';
  }
}

function openInviteFallbackMail(email, role) {
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

document.getElementById('btn-invite').addEventListener('click', async () => {
  const emailEl = document.getElementById('inv-email');
  const roleEl = document.getElementById('inv-role');
  const email = emailEl.value.trim().toLowerCase();
  const role = roleEl.value;
  if (!email || !email.includes('@')) { alert('Bitte gültige E-Mail-Adresse eingeben.'); return; }
  setSyncStatus('pending');
  try {
    const { data: inserted, error } = await supabase
      .from('invites')
      .insert({
        household_id: currentHouseholdId,
        email,
        role,
        invited_by: currentUser.id,
      })
      .select('id')
      .single();
    if (error) throw error;
    emailEl.value = '';
    setSyncStatus('ok');
    renderMitglieder();

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
          'Möchtest du eine E-Mail aus deinem Mail-Programm an ' +
          email +
          ' verfassen?'
      );
      if (useMailto) openInviteFallbackMail(email, role);
    } else {
      alert('Einladung an ' + email + ' versendet.');
    }
  } catch (e) {
    setSyncStatus('error', e);
  }
});

/* ---- BOOTSTRAP ---- */
bindStammdaten();
showLogin();
bootstrap();
