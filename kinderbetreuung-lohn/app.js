'use strict';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = 'https://tbknudbcgaarqixweizj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YHSXK9ryn8RQQe__e3aB2Q_lQo13XaP';
const LIMIT_VEREINFACHT = 22680; // CHF/Jahr brutto pro Person 2026

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, flowType: 'pkce' }
});

let currentUser = null;
let currentHouseholdId = null;
let currentRole = null; // 'owner' | 'admin' | 'employee'
let membersCache = new Map();

/* ---- DEFAULTS ---- */
function defaultSaetze() {
  return {
    stundenlohn: 30.00,
    ferienzulageProzent: 8.33,
    satzAhvIvEoAN: 5.30, satzAhvIvEoAG: 5.30,
    satzAlvAN: 1.10,     satzAlvAG: 1.10,
    satzFakAG: 1.00,
    satzQuellensteuer: 5.00,
    satzVerwaltungskostenAG: 0.40,
    uvgAktiv: true,
    satzUvgBuAG: 0.505,
    satzUvgNbuAN: 1.47
  };
}

/* ---- SANITIZATION ---- */
const asString = v => typeof v === 'string' ? v : (v == null ? '' : String(v));
const asNumber = (v, fallback) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

function sanitizeState(raw) {
  raw = (raw && typeof raw === 'object') ? raw : {};
  const def = defaultSaetze();
  const e = (raw.einstellungen && typeof raw.einstellungen === 'object') ? raw.einstellungen : {};
  const ag = (raw.arbeitgeber && typeof raw.arbeitgeber === 'object') ? raw.arbeitgeber : {};
  const an = (raw.arbeitnehmer && typeof raw.arbeitnehmer === 'object') ? raw.arbeitnehmer : {};
  return {
    arbeitgeber: {
      name: asString(ag.name),
      adresse: asString(ag.adresse),
      ahvAbrechnungsnr: asString(ag.ahvAbrechnungsnr)
    },
    arbeitnehmer: {
      name: asString(an.name),
      adresse: asString(an.adresse),
      geburtsdatum: asString(an.geburtsdatum),
      ahvNr: asString(an.ahvNr),
      iban: asString(an.iban),
      wochenstundenSchwelle8h: !!an.wochenstundenSchwelle8h
    },
    einstellungen: {
      stundenlohn:             asNumber(e.stundenlohn,             def.stundenlohn),
      ferienzulageProzent:     asNumber(e.ferienzulageProzent,     def.ferienzulageProzent),
      satzAhvIvEoAN:           asNumber(e.satzAhvIvEoAN,           def.satzAhvIvEoAN),
      satzAhvIvEoAG:           asNumber(e.satzAhvIvEoAG,           def.satzAhvIvEoAG),
      satzAlvAN:               asNumber(e.satzAlvAN,               def.satzAlvAN),
      satzAlvAG:               asNumber(e.satzAlvAG,               def.satzAlvAG),
      satzFakAG:               asNumber(e.satzFakAG,               def.satzFakAG),
      satzQuellensteuer:       asNumber(e.satzQuellensteuer,       def.satzQuellensteuer),
      satzVerwaltungskostenAG: asNumber(e.satzVerwaltungskostenAG, def.satzVerwaltungskostenAG),
      uvgAktiv:                e.uvgAktiv === undefined ? def.uvgAktiv : !!e.uvgAktiv,
      satzUvgBuAG:             asNumber(e.satzUvgBuAG,             def.satzUvgBuAG),
      satzUvgNbuAN:            asNumber(e.satzUvgNbuAN,            def.satzUvgNbuAN)
    },
    einsaetze: Array.isArray(raw.einsaetze)
      ? raw.einsaetze.map(x => {
          if (!x || typeof x !== 'object') return null;
          const stunden = asNumber(x.stunden, NaN);
          const datum = asString(x.datum);
          if (!datum || !Number.isFinite(stunden) || stunden <= 0) return null;
          return {
            id: asString(x.id),
            datum, stunden,
            notiz: asString(x.notiz),
            entered_by: asString(x.entered_by)
          };
        }).filter(Boolean)
      : []
  };
}

let state = sanitizeState({});

/* ---- FORMATTERS ---- */
function fmtChf(n) {
  if (!isFinite(n)) n = 0;
  return n.toLocaleString('de-CH', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function round2(n) { return Math.round(n*100)/100; }

function fmtDate(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function monthLabel(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  return `${months[m-1]} ${y}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---- BERECHNUNG ---- */
function berechneAbrechnung(einsaetze, einst, arbeitnehmer) {
  const stundenTotal = einsaetze.reduce((s,e) => s + (Number(e.stunden)||0), 0);
  const bruttoStunden = round2(stundenTotal * einst.stundenlohn);
  const ferienzulage  = round2(bruttoStunden * einst.ferienzulageProzent / 100);
  const bruttoTotal   = round2(bruttoStunden + ferienzulage);

  const nbuApplicable = einst.uvgAktiv && arbeitnehmer.wochenstundenSchwelle8h;

  const an = {
    ahvIvEo:    round2(bruttoTotal * einst.satzAhvIvEoAN / 100),
    alv:        round2(bruttoTotal * einst.satzAlvAN / 100),
    nbu:        nbuApplicable ? round2(bruttoTotal * einst.satzUvgNbuAN / 100) : 0,
    quellenst:  round2(bruttoTotal * einst.satzQuellensteuer / 100)
  };
  an.total = round2(an.ahvIvEo + an.alv + an.nbu + an.quellenst);
  const netto = round2(bruttoTotal - an.total);

  const ag = {
    ahvIvEo: round2(bruttoTotal * einst.satzAhvIvEoAG / 100),
    alv:     round2(bruttoTotal * einst.satzAlvAG / 100),
    fak:     round2(bruttoTotal * einst.satzFakAG / 100),
    bu:      einst.uvgAktiv ? round2(bruttoTotal * einst.satzUvgBuAG / 100) : 0,
    verw:    round2(bruttoTotal * einst.satzVerwaltungskostenAG / 100)
  };
  ag.total = round2(ag.ahvIvEo + ag.alv + ag.fak + ag.bu + ag.verw);
  const agKostenTotal = round2(bruttoTotal + ag.total);

  return { stundenTotal: round2(stundenTotal), bruttoStunden, ferienzulage, bruttoTotal, an, netto, ag, agKostenTotal, nbuApplicable };
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
    const { error } = await supabase.rpc('create_household_for_self', { p_name: name });
    if (error) throw error;
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
  const { data: { session } } = await supabase.auth.getSession();
  if (session && session.user) {
    await onSignedIn(session.user);
  } else {
    showLogin();
  }
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
    // Trigger may need a moment after signup
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
  setSyncStatus('ok');
}

async function fetchMembership() {
  const { data, error } = await supabase
    .from('memberships')
    .select('household_id, role')
    .eq('user_id', currentUser.id)
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
  inviteText.textContent = `Du wurdest in „${householdName}" als ${invite.role} eingeladen.`;
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
  const [stateRes, einsRes] = await Promise.all([
    supabase.from('household_state').select('*').eq('household_id', currentHouseholdId).maybeSingle(),
    supabase.from('einsaetze').select('id, datum, stunden, notiz, entered_by').eq('household_id', currentHouseholdId).order('datum')
  ]);
  if (stateRes.error) throw stateRes.error;
  if (einsRes.error) throw einsRes.error;

  const stateRow = stateRes.data || {};
  state = sanitizeState({
    arbeitgeber:   stateRow.arbeitgeber,
    arbeitnehmer:  stateRow.arbeitnehmer,
    einstellungen: stateRow.einstellungen,
    einsaetze: (einsRes.data || []).map(r => ({
      id: r.id, datum: r.datum, stunden: Number(r.stunden), notiz: r.notiz || '', entered_by: r.entered_by
    }))
  });
}

/* ---- CLOUD SAVE: household_state (debounced) ---- */
let stateSaveTimer = null;
function persistHouseholdState() {
  if (currentRole !== 'owner' && currentRole !== 'admin') return;
  setSyncStatus('pending');
  clearTimeout(stateSaveTimer);
  stateSaveTimer = setTimeout(async () => {
    try {
      const { error } = await supabase
        .from('household_state')
        .upsert({
          household_id: currentHouseholdId,
          arbeitgeber: state.arbeitgeber,
          arbeitnehmer: state.arbeitnehmer,
          einstellungen: state.einstellungen,
          updated_at: new Date().toISOString()
        });
      if (error) throw error;
      setSyncStatus('ok');
    } catch (e) {
      setSyncStatus('error', e);
    }
  }, 1000);
}

/* ---- CLOUD SAVE: einsaetze ---- */
async function addEinsatzCloud({ datum, stunden, notiz }) {
  setSyncStatus('pending');
  try {
    const { data, error } = await supabase
      .from('einsaetze')
      .insert({
        household_id: currentHouseholdId,
        datum, stunden, notiz,
        entered_by: currentUser.id
      })
      .select()
      .single();
    if (error) throw error;
    state.einsaetze.push({
      id: data.id, datum: data.datum, stunden: Number(data.stunden),
      notiz: data.notiz || '', entered_by: data.entered_by
    });
    state.einsaetze.sort((a,b) => a.datum.localeCompare(b.datum));
    setSyncStatus('ok');
    renderEntries();
  } catch (e) { setSyncStatus('error', e); }
}

async function deleteEinsatzCloud(id) {
  setSyncStatus('pending');
  try {
    const { error } = await supabase.from('einsaetze').delete().eq('id', id);
    if (error) throw error;
    state.einsaetze = state.einsaetze.filter(x => x.id !== id);
    setSyncStatus('ok');
    renderEntries();
  } catch (e) { setSyncStatus('error', e); }
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
  if (id === 'monat')      renderMonatTab();
  if (id === 'jahr')       renderJahrTab();
  if (id === 'erfassung')  renderEntries();
  if (id === 'mitglieder') renderMitglieder();
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
  const userStripRole = document.getElementById('user-strip-role');
  userStripRole.textContent = role;
  userStripRole.className = 'role-badge ' + role;
  const activePanel = document.querySelector('section[role="tabpanel"].active');
  const activeId = activePanel ? activePanel.id : 'erfassung';
  const activeBtn = document.querySelector(`nav button[data-tab="${activeId}"]`);
  if (!activeBtn || activeBtn.hidden) showTab('erfassung');
}

/* ---- BIND FORM FIELDS ---- */
function bind(id, getter, setter, type) {
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
    persistHouseholdState();
  });
  return apply;
}

const refreshFns = [];

function bindStammdatenAndSettings() {
  refreshFns.push(bind('ag-name',          () => state.arbeitgeber.name,             v => state.arbeitgeber.name = v));
  refreshFns.push(bind('ag-adresse',       () => state.arbeitgeber.adresse,          v => state.arbeitgeber.adresse = v));
  refreshFns.push(bind('ag-abrechnungsnr', () => state.arbeitgeber.ahvAbrechnungsnr, v => state.arbeitgeber.ahvAbrechnungsnr = v));

  refreshFns.push(bind('an-name',         () => state.arbeitnehmer.name,         v => state.arbeitnehmer.name = v));
  refreshFns.push(bind('an-adresse',      () => state.arbeitnehmer.adresse,      v => state.arbeitnehmer.adresse = v));
  refreshFns.push(bind('an-geburtsdatum', () => state.arbeitnehmer.geburtsdatum, v => state.arbeitnehmer.geburtsdatum = v));
  refreshFns.push(bind('an-ahvnr',        () => state.arbeitnehmer.ahvNr,        v => state.arbeitnehmer.ahvNr = v));
  refreshFns.push(bind('an-iban',         () => state.arbeitnehmer.iban,         v => state.arbeitnehmer.iban = v));
  refreshFns.push(bind('an-8h',           () => state.arbeitnehmer.wochenstundenSchwelle8h, v => state.arbeitnehmer.wochenstundenSchwelle8h = v, 'checkbox'));

  refreshFns.push(bind('s-stundenlohn', () => state.einstellungen.stundenlohn,             v => state.einstellungen.stundenlohn = v,             'number'));
  refreshFns.push(bind('s-ferien',      () => state.einstellungen.ferienzulageProzent,     v => state.einstellungen.ferienzulageProzent = v,     'number'));
  refreshFns.push(bind('s-ahv-an',      () => state.einstellungen.satzAhvIvEoAN,           v => state.einstellungen.satzAhvIvEoAN = v,           'number'));
  refreshFns.push(bind('s-ahv-ag',      () => state.einstellungen.satzAhvIvEoAG,           v => state.einstellungen.satzAhvIvEoAG = v,           'number'));
  refreshFns.push(bind('s-alv-an',      () => state.einstellungen.satzAlvAN,               v => state.einstellungen.satzAlvAN = v,               'number'));
  refreshFns.push(bind('s-alv-ag',      () => state.einstellungen.satzAlvAG,               v => state.einstellungen.satzAlvAG = v,               'number'));
  refreshFns.push(bind('s-fak-ag',      () => state.einstellungen.satzFakAG,               v => state.einstellungen.satzFakAG = v,               'number'));
  refreshFns.push(bind('s-verw-ag',     () => state.einstellungen.satzVerwaltungskostenAG, v => state.einstellungen.satzVerwaltungskostenAG = v, 'number'));
  refreshFns.push(bind('s-quellen',     () => state.einstellungen.satzQuellensteuer,       v => state.einstellungen.satzQuellensteuer = v,       'number'));
  refreshFns.push(bind('s-uvg-aktiv',   () => state.einstellungen.uvgAktiv,                v => state.einstellungen.uvgAktiv = v,                'checkbox'));
  refreshFns.push(bind('s-bu-ag',       () => state.einstellungen.satzUvgBuAG,             v => state.einstellungen.satzUvgBuAG = v,             'number'));
  refreshFns.push(bind('s-nbu-an',      () => state.einstellungen.satzUvgNbuAN,            v => state.einstellungen.satzUvgNbuAN = v,            'number'));
}

/* ---- ERFASSUNG ---- */
const eDatum = document.getElementById('e-datum');
const eStunden = document.getElementById('e-stunden');
const eNotiz = document.getElementById('e-notiz');
eDatum.value = new Date().toISOString().slice(0,10);

document.getElementById('btn-add').addEventListener('click', async () => {
  const datum = eDatum.value;
  const stunden = Number(eStunden.value);
  const notiz = eNotiz.value.trim();
  if (!datum) { alert('Bitte ein Datum eingeben.'); return; }
  if (!stunden || stunden <= 0) { alert('Bitte gültige Stundenzahl eingeben.'); return; }
  if (!currentHouseholdId) { alert('Nicht angemeldet.'); return; }
  await addEinsatzCloud({ datum, stunden, notiz });
  eStunden.value = '';
  eNotiz.value = '';
});

function renderEntries() {
  const list = document.getElementById('entries-list');
  if (!list) return;
  const userId = currentUser ? currentUser.id : null;
  const visible = currentRole === 'employee'
    ? state.einsaetze.filter(e => e.entered_by === userId)
    : state.einsaetze;

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
    const betrag = round2(e.stunden * state.einstellungen.stundenlohn);
    const canDelete = currentRole !== 'employee' || e.entered_by === userId;
    const delBtn = canDelete ? `<button class="btn btn-small btn-danger" data-del="${e.id}">Löschen</button>` : '';
    const enteredCell = showEnteredBy ? `<td>${escapeHtml(enteredByLabel(e.entered_by))}</td>` : '';
    return `<tr>
      <td>${fmtDate(e.datum)}</td>
      ${enteredCell}
      <td>${e.notiz ? escapeHtml(e.notiz) : '<span class="muted">–</span>'}</td>
      <td class="num">${e.stunden.toLocaleString('de-CH')}</td>
      <td class="num">CHF ${fmtChf(betrag)}</td>
      <td class="actions">${delBtn}</td>
    </tr>`;
  }).join('');
  const totalH = visible.reduce((s,e) => s + e.stunden, 0);
  const totalB = round2(totalH * state.einstellungen.stundenlohn);
  const enteredHead = showEnteredBy ? '<th>Erfasst von</th>' : '';
  const totalColspan = showEnteredBy ? 3 : 2;
  list.innerHTML = `<table>
    <thead><tr><th>Datum</th>${enteredHead}<th>Notiz</th><th class="num">Stunden</th><th class="num">Betrag (Stundenlohn)</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row"><td colspan="${totalColspan}">Total</td><td class="num">${totalH.toLocaleString('de-CH')}</td><td class="num">CHF ${fmtChf(totalB)}</td><td></td></tr></tfoot>
  </table>`;
  list.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Eintrag wirklich löschen?')) return;
      await deleteEinsatzCloud(btn.dataset.del);
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
  const eintraege = state.einsaetze.filter(e => e.datum.startsWith(yyyymm));
  target.innerHTML = renderLohnabrechnung(eintraege, yyyymm);
}

function renderLohnabrechnung(eintraege, yyyymm) {
  const e = state.einstellungen;
  const ag = state.arbeitgeber;
  const an = state.arbeitnehmer;
  const calc = berechneAbrechnung(eintraege, e, an);

  if (!eintraege.length) {
    return `<div class="empty-state">Keine Einsätze in ${escapeHtml(monthLabel(yyyymm))} erfasst.</div>`;
  }

  const stundenRows = eintraege.map(x => `
    <tr>
      <td>${fmtDate(x.datum)}</td>
      <td>${x.notiz ? escapeHtml(x.notiz) : ''}</td>
      <td class="num">${x.stunden.toLocaleString('de-CH')}</td>
      <td class="num">CHF ${fmtChf(e.stundenlohn)}</td>
      <td class="num">CHF ${fmtChf(round2(x.stunden * e.stundenlohn))}</td>
    </tr>`).join('');

  const nbuLine = e.uvgAktiv && an.wochenstundenSchwelle8h
    ? `<div class="summary-row"><span>– UVG-NBU (${e.satzUvgNbuAN} %)</span><span>CHF ${fmtChf(calc.an.nbu)}</span></div>`
    : '';

  const buLine = e.uvgAktiv
    ? `<div class="summary-row"><span>UVG-BU (${e.satzUvgBuAG} %)</span><span>CHF ${fmtChf(calc.ag.bu)}</span></div>`
    : '';

  return `<div class="print-doc">
    <div class="doc-header">
      <div class="party">
        <div class="label-small">Arbeitgeber/in</div>
        <div class="name">${escapeHtml(ag.name) || '<span class="muted">(Stammdaten ergänzen)</span>'}</div>
        <div>${escapeHtml(ag.adresse)}</div>
        ${ag.ahvAbrechnungsnr ? `<div class="muted">SVA-Abr.-Nr.: ${escapeHtml(ag.ahvAbrechnungsnr)}</div>` : ''}
      </div>
      <div class="party" style="text-align:right;">
        <div class="label-small">Arbeitnehmer/in</div>
        <div class="name">${escapeHtml(an.name) || '<span class="muted">(Stammdaten ergänzen)</span>'}</div>
        <div>${escapeHtml(an.adresse)}</div>
        ${an.ahvNr ? `<div class="muted">AHV-Nr.: ${escapeHtml(an.ahvNr)}</div>` : ''}
      </div>
    </div>

    <div class="doc-title">
      <h1>Lohnabrechnung Kinderbetreuung</h1>
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
    <div class="summary-row"><span>+ Ferienzulage (${e.ferienzulageProzent} %)</span><span>CHF ${fmtChf(calc.ferienzulage)}</span></div>
    <div class="summary-row total"><span>Bruttolohn</span><span>CHF ${fmtChf(calc.bruttoTotal)}</span></div>

    <h4>Abzüge Arbeitnehmer/in</h4>
    <div class="summary-row"><span>– AHV/IV/EO (${e.satzAhvIvEoAN} %)</span><span>CHF ${fmtChf(calc.an.ahvIvEo)}</span></div>
    <div class="summary-row"><span>– ALV (${e.satzAlvAN} %)</span><span>CHF ${fmtChf(calc.an.alv)}</span></div>
    ${nbuLine}
    <div class="summary-row"><span>– Quellensteuer (${e.satzQuellensteuer} %)</span><span>CHF ${fmtChf(calc.an.quellenst)}</span></div>
    <div class="summary-row total"><span>Total Abzüge</span><span>CHF ${fmtChf(calc.an.total)}</span></div>

    <div class="summary-row netto"><span>Auszahlung netto</span><span>CHF ${fmtChf(calc.netto)}</span></div>

    <h4>Arbeitgeberbeiträge (informativ, nicht vom Lohn abgezogen)</h4>
    <div class="summary-row"><span>AHV/IV/EO (${e.satzAhvIvEoAG} %)</span><span>CHF ${fmtChf(calc.ag.ahvIvEo)}</span></div>
    <div class="summary-row"><span>ALV (${e.satzAlvAG} %)</span><span>CHF ${fmtChf(calc.ag.alv)}</span></div>
    <div class="summary-row"><span>FAK (${e.satzFakAG} %)</span><span>CHF ${fmtChf(calc.ag.fak)}</span></div>
    ${buLine}
    <div class="summary-row"><span>Verwaltungskosten (${e.satzVerwaltungskostenAG} %)</span><span>CHF ${fmtChf(calc.ag.verw)}</span></div>
    <div class="summary-row total"><span>Total Arbeitgeberbeiträge</span><span>CHF ${fmtChf(calc.ag.total)}</span></div>
    <div class="summary-row total"><span>Total Arbeitgeberkosten (Brutto + AG-Beiträge)</span><span>CHF ${fmtChf(calc.agKostenTotal)}</span></div>

    <div class="footnote">
      Vereinfachtes Abrechnungsverfahren der SVA Zürich (${e.uvgAktiv ? 'VAVplus' : 'VAV'}). Quellensteuer und Sozialversicherungsbeiträge werden direkt mit der Ausgleichskasse abgerechnet. ${e.uvgAktiv ? 'Unfallversicherung über SVA Zürich.' : 'Unfallversicherung separat über privaten Versicherer.'}
    </div>

    <div class="signatures">
      <div class="sig">Ort, Datum &amp; Unterschrift Arbeitgeber/in</div>
      <div class="sig">Ort, Datum &amp; Unterschrift Arbeitnehmer/in (Empfangsbestätigung)</div>
    </div>
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
  const eintraege = state.einsaetze.filter(e => e.datum.startsWith(String(jahr)));
  target.innerHTML = renderJahresuebersicht(eintraege, jahr);
}

function renderJahresuebersicht(eintraege, jahr) {
  const e = state.einstellungen;
  const an = state.arbeitnehmer;
  const ag = state.arbeitgeber;

  const monatsRows = [];
  let yJahresBrutto = 0, yJahresStunden = 0, yJahresNetto = 0, yJahresAG = 0, yJahresAN = 0;

  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const yyyymm = `${jahr}-${mm}`;
    const monatEintraege = eintraege.filter(x => x.datum.startsWith(yyyymm));
    if (!monatEintraege.length) continue;
    const calc = berechneAbrechnung(monatEintraege, e, an);
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
        <div class="name">${escapeHtml(ag.name) || '<span class="muted">(Stammdaten)</span>'}</div>
        <div>${escapeHtml(ag.adresse)}</div>
      </div>
      <div class="party" style="text-align:right;">
        <div class="label-small">Arbeitnehmer/in</div>
        <div class="name">${escapeHtml(an.name) || '<span class="muted">(Stammdaten)</span>'}</div>
        ${an.ahvNr ? `<div class="muted">AHV-Nr.: ${escapeHtml(an.ahvNr)}</div>` : ''}
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
      Den Bruttolohn von <strong>CHF ${fmtChf(yJahresBrutto)}</strong> bei der SVA Zürich als Lohndeklaration ${jahr} einreichen (Frist üblicherweise Ende Januar ${jahr+1}). Die Ausgleichskasse stellt anschliessend die Schlussrechnung über Sozialversicherungsbeiträge${e.uvgAktiv ? ', UVG-Prämien' : ''} und Quellensteuer.
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

/* ---- DATEN VERWALTEN (Einstellungen-Tab, owner/admin) ---- */
document.getElementById('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kinderbetreuung-lohn-export-${new Date().toISOString().slice(0,10)}.json`;
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
      const { error: stErr } = await supabase.from('household_state').upsert({
        household_id: currentHouseholdId,
        arbeitgeber: fresh.arbeitgeber,
        arbeitnehmer: fresh.arbeitnehmer,
        einstellungen: fresh.einstellungen,
        updated_at: new Date().toISOString()
      });
      if (stErr) throw stErr;
      const { error: delErr } = await supabase.from('einsaetze').delete().eq('household_id', currentHouseholdId);
      if (delErr) throw delErr;
      if (fresh.einsaetze.length) {
        const rows = fresh.einsaetze.map(e => ({
          household_id: currentHouseholdId,
          datum: e.datum, stunden: e.stunden, notiz: e.notiz,
          entered_by: currentUser.id
        }));
        const { error: insErr } = await supabase.from('einsaetze').insert(rows);
        if (insErr) throw insErr;
      }
      await loadFromCloud();
      refreshFns.forEach(fn => fn());
      renderEntries();
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

document.getElementById('btn-reset-saetze').addEventListener('click', () => {
  if (!confirm('Beitragssätze auf 2026-Standard zurücksetzen?')) return;
  state.einstellungen = defaultSaetze();
  refreshFns.forEach(fn => fn());
  persistHouseholdState();
});

document.getElementById('btn-clear-all').addEventListener('click', async () => {
  if (!confirm('Wirklich ALLE Daten (Stammdaten, Einsätze, Einstellungen) löschen?')) return;
  if (!confirm('Sicher? Dies kann nicht rückgängig gemacht werden.')) return;
  setSyncStatus('pending');
  try {
    const { error: delErr } = await supabase.from('einsaetze').delete().eq('household_id', currentHouseholdId);
    if (delErr) throw delErr;
    const blank = sanitizeState({});
    const { error: stErr } = await supabase.from('household_state').upsert({
      household_id: currentHouseholdId,
      arbeitgeber: blank.arbeitgeber,
      arbeitnehmer: blank.arbeitnehmer,
      einstellungen: blank.einstellungen,
      updated_at: new Date().toISOString()
    });
    if (stErr) throw stErr;
    state = blank;
    refreshFns.forEach(fn => fn());
    renderEntries();
    setSyncStatus('ok');
  } catch (e) {
    setSyncStatus('error', e);
  }
});

/* ---- MITGLIEDER ---- */
async function loadMembers() {
  const { data, error } = await supabase
    .from('membership_users')
    .select('*')
    .eq('household_id', currentHouseholdId);
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
              <span class="role-badge ${m.role}">${m.role}</span>
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
            const { error } = await supabase
              .from('memberships')
              .delete()
              .eq('household_id', currentHouseholdId)
              .eq('user_id', userId);
            if (error) throw error;
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
            <span class="role-badge ${i.role}">${i.role}</span>
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

document.getElementById('btn-invite').addEventListener('click', async () => {
  const emailEl = document.getElementById('inv-email');
  const roleEl = document.getElementById('inv-role');
  const email = emailEl.value.trim().toLowerCase();
  const role = roleEl.value;
  if (!email || !email.includes('@')) { alert('Bitte gültige E-Mail-Adresse eingeben.'); return; }
  setSyncStatus('pending');
  try {
    const { error } = await supabase.from('invites').insert({
      household_id: currentHouseholdId,
      email, role,
      invited_by: currentUser.id
    });
    if (error) throw error;
    emailEl.value = '';
    setSyncStatus('ok');
    renderMitglieder();
  } catch (e) { setSyncStatus('error', e); }
});

/* ---- BOOTSTRAP ---- */
bindStammdatenAndSettings();
showLogin();
bootstrap();
