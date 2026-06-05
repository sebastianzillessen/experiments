import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { supabase } from '../supabaseClient';
import { useApp } from '../context/AppContext';
import { versionHasShifts } from '../lib/payroll';
import { monthLabel } from '../lib/format';
import { defaultPaySettingsData, normalizeEffectiveMonth } from '../lib/state';
import type { PaySettingsData } from '../lib/state';

type NumericKey = Exclude<keyof PaySettingsData, 'uvgEnabled'>;

const PS_NUMERIC_FIELDS: { domId: string; key: NumericKey; step: number; label: string }[] = [
  // hourlyRate moved to per-employee employee_wages — only household-wide
  // statutory/cantonal rates live here now.
  { domId: 'ps-holiday-percent',   key: 'holidayPercent',   step: 0.01,  label: 'Feiertagszulage (% auf Bruttostunden, ZH üblich 3.59 %)' },
  { domId: 'ps-ahv-employee',      key: 'ahvIvEoEmployee',  step: 0.01,  label: 'AHV/IV/EO Arbeitnehmer' },
  { domId: 'ps-ahv-employer',      key: 'ahvIvEoEmployer',  step: 0.01,  label: 'AHV/IV/EO Arbeitgeber' },
  { domId: 'ps-alv-employee',      key: 'alvEmployee',      step: 0.01,  label: 'ALV Arbeitnehmer' },
  { domId: 'ps-alv-employer',      key: 'alvEmployer',      step: 0.01,  label: 'ALV Arbeitgeber' },
  { domId: 'ps-fak-employer',      key: 'fakEmployer',      step: 0.01,  label: 'FAK Arbeitgeber (Kt. ZH)' },
  { domId: 'ps-admin-fee-employer',key: 'adminFeeEmployer', step: 0.01,  label: 'Verwaltungskosten (% der AHV/IV/EO-Beiträge)' },
  { domId: 'ps-withholding-tax',   key: 'withholdingTax',   step: 0.01,  label: 'Quellensteuer (VAV, einheitlich 5 %)' },
  { domId: 'ps-uvg-bu-employer',   key: 'uvgBuEmployer',    step: 0.001, label: 'UVG-BU Arbeitgeber (%)' },
  { domId: 'ps-uvg-nbu-employee',  key: 'uvgNbuEmployee',   step: 0.001, label: 'UVG-NBU Arbeitnehmer (%, nur ab 8 h/Woche)' }
];

type PsUi =
  | { mode: 'list' }
  | { mode: 'edit'; id: string; locked: boolean }
  | { mode: 'add'; locked: false };

type Draft = {
  month: string; // "YYYY-MM" input value
  fields: Record<NumericKey, string>;
  uvgEnabled: boolean;
};

function fieldsFromData(d: PaySettingsData): Record<NumericKey, string> {
  const out = {} as Record<NumericKey, string>;
  for (const f of PS_NUMERIC_FIELDS) out[f.key] = String(d[f.key]);
  return out;
}

// Set or change the signed-in user's password (works for accounts created via
// magic link too). Employees without access to this tab use the
// "Passwort vergessen?" recovery flow on the login screen instead.
function AccountCard() {
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onChangePassword() {
    setMsg(null);
    if (!password || password.length < 8) {
      setMsg({ ok: false, text: 'Bitte ein Passwort mit mindestens 8 Zeichen wählen.' });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setMsg({ ok: true, text: 'Passwort aktualisiert. Du kannst dich ab jetzt mit E-Mail und Passwort anmelden.' });
    } catch (e) {
      const m = (e as { message?: string })?.message || String(e);
      setMsg({ ok: false, text: 'Speichern fehlgeschlagen: ' + m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Konto</h3>
      <div className="grid-2">
        <div>
          <label htmlFor="account-new-password">Neues Passwort (min. 8 Zeichen)</label>
          <input type="password" id="account-new-password" autoComplete="new-password"
            value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn" id="btn-change-password" disabled={busy} onClick={onChangePassword}>
            {busy ? 'Wird gespeichert …' : 'Passwort festlegen / ändern'}
          </button>
        </div>
      </div>
      {msg && (
        <div id="account-password-msg" className={msg.ok ? 'success' : 'auth-error'} style={{ marginTop: 12 }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

export function EinstellungenTab() {
  const {
    activeTab, data, addPaySettings, updatePaySettings, deletePaySettings,
    importState, clearAll, setSyncStatus, primedTabs
  } = useApp();
  const [psUi, setPsUi] = useState<PsUi>({ mode: 'list' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const editing = psUi.mode !== 'list' && draft !== null;
  const isAdd = psUi.mode === 'add';
  const locked = psUi.mode !== 'list' ? psUi.locked : false;

  useEffect(() => {
    if (editing) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editing, psUi]);

  function openEdit(id: string) {
    const v = data.paySettings.find(x => x.id === id);
    if (!v) return;
    const isLocked = versionHasShifts(data, v);
    setPsUi({ mode: 'edit', id, locked: isLocked });
    setDraft({ month: v.effectiveMonth.slice(0, 7), fields: fieldsFromData(v.data), uvgEnabled: !!v.data.uvgEnabled });
    setFormError(null);
  }

  function openAdd() {
    // Default month: month after the latest shift, or current month.
    const latestShiftDate = data.shifts.length ? data.shifts[data.shifts.length - 1].date : null;
    let defaultMonth: string;
    if (latestShiftDate) {
      const [y, m] = latestShiftDate.split('-').map(Number);
      const next = new Date(Date.UTC(y, m, 1));
      defaultMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
    } else {
      const now = new Date();
      defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    // Prefill data from latest version, otherwise defaults.
    const latest = data.paySettings[data.paySettings.length - 1];
    const psData = latest ? { ...latest.data } : defaultPaySettingsData();
    setPsUi({ mode: 'add', locked: false });
    setDraft({ month: defaultMonth.slice(0, 7), fields: fieldsFromData(psData), uvgEnabled: !!psData.uvgEnabled });
    setFormError(null);
  }

  function closeEdit() {
    setPsUi({ mode: 'list' });
    setDraft(null);
    setFormError(null);
  }

  // Read all form fields back into a data object (mirrors collectDraftFromForm).
  function collectDraft(): { error: string } | { effectiveMonth: string; data: PaySettingsData } {
    if (!draft) return { error: 'Kein Entwurf.' };
    const month = normalizeEffectiveMonth(draft.month);
    if (!month) {
      return { error: 'Bitte einen gültigen Monat wählen.' };
    }
    const out = defaultPaySettingsData();
    for (const f of PS_NUMERIC_FIELDS) {
      const raw = draft.fields[f.key];
      const v = raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(v) || v < 0) {
        return { error: `Ungültiger Wert in ${f.label}.` };
      }
      out[f.key] = v;
    }
    out.uvgEnabled = !!draft.uvgEnabled;
    return { effectiveMonth: month, data: out };
  }

  async function onSave() {
    setFormError(null);
    const result = collectDraft();
    if ('error' in result) {
      setFormError(result.error);
      return;
    }
    const { effectiveMonth, data: psData } = result;
    if (psUi.mode === 'add') {
      // Client-side preflight: shifts on or after effectiveMonth would be retroactively shifted.
      if (data.shifts.some(s => s.date >= effectiveMonth)) {
        setFormError('Es existieren bereits Einsätze am oder nach diesem Monat — die Sätze würden rückwirkend gelten. Bitte späteren Monat wählen.');
        return;
      }
      // Conflict with existing version on the exact same month.
      if (data.paySettings.some(v => v.effectiveMonth === effectiveMonth)) {
        setFormError('Für diesen Monat existiert bereits eine Version.');
        return;
      }
      const ok = await addPaySettings(effectiveMonth, psData);
      if (ok) closeEdit();
    } else if (psUi.mode === 'edit') {
      const ok = await updatePaySettings(psUi.id, psData);
      if (ok) closeEdit();
    }
  }

  async function onDelete() {
    if (psUi.mode !== 'edit') return;
    if (!confirm('Diese Version wirklich löschen? (Nur möglich, solange keine Einsätze in der Periode liegen.)')) return;
    const ok = await deletePaySettings(psUi.id);
    if (ok) closeEdit();
  }

  /* ---- Daten verwalten ---- */
  function onExport() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salaerli-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
  }

  function onImportFile(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!confirm('Aktuelle Daten überschreiben?')) return;
        await importState(parsed);
        alert('Daten importiert.');
      } catch (err) {
        setSyncStatus('error', err);
        alert('Import fehlgeschlagen: ' + ((err as { message?: string })?.message || err));
      }
    };
    reader.readAsText(file);
    ev.target.value = '';
  }

  async function onClearAll() {
    if (!confirm('Wirklich ALLE Daten (Stammdaten, Mitarbeitende, Einsätze, Sätze) löschen?')) return;
    if (!confirm('Sicher? Dies kann nicht rückgängig gemacht werden.')) return;
    try {
      await clearAll();
      closeEdit();
    } catch {
      // sync status already set by clearAll
    }
  }

  const editTitle = isAdd
    ? 'Neue Version anlegen'
    : (locked ? 'Version (gesperrt)' : 'Version bearbeiten');

  return (
    <section id="einstellungen" role="tabpanel" aria-labelledby="tab-einstellungen" tabIndex={0}
      className={activeTab === 'einstellungen' ? 'active' : undefined}>
      <h2>Einstellungen &amp; Beitragssätze</h2>
      <div className="section-sub">Diese Sätze (Feiertagszulage, Sozialversicherung, UVG, Quellensteuer, Verwaltungskosten) gelten haushaltsweit für alle Mitarbeitenden ab dem gewählten Monatsanfang. Geänderte Sätze (z.&nbsp;B. neue Jahres-Sätze) legst du als neue Version „gültig ab" an; frühere Versionen sind gesperrt, sobald Einsätze in deren Periode liegen. Den <strong>Stundenlohn</strong> legst du pro Person unter „Mitarbeitende" fest.</div>

      <div className="card">
        <h3>Versionen</h3>
        <div id="pay-settings-list">
          {!primedTabs.has('einstellungen') ? (
            <div className="empty-state">Lade …</div>
          ) : !data.paySettings.length ? (
            <div className="empty-state">Noch keine Sätze hinterlegt. Lege eine erste Version an, bevor du Lohnabrechnungen erstellst.</div>
          ) : (
            data.paySettings.map(v => {
              const isLocked = versionHasShifts(data, v);
              const monthYm = v.effectiveMonth.slice(0, 7);
              const summary = `Feiertage ${v.data.holidayPercent} % · AHV ${v.data.ahvIvEoEmployee} %${v.data.uvgEnabled ? ' · UVG' : ''}`;
              return (
                <div className="member-row" key={v.id ?? monthYm}>
                  <div className="info-block">
                    <div className="name">ab {monthLabel(monthYm)}</div>
                    <div className="meta">{summary}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {isLocked && <span className="muted" title="Einsätze in dieser Periode vorhanden">🔒 gesperrt</span>}
                    <button className="btn btn-small" data-edit-ps={v.id ?? undefined}
                      onClick={() => v.id && openEdit(v.id)}>
                      {isLocked ? 'Anzeigen' : 'Bearbeiten'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="btn-row">
          <button className="btn" id="btn-add-pay-settings" onClick={openAdd}>Neue Version anlegen</button>
        </div>
      </div>

      <div id="pay-settings-edit-panel" hidden={!editing} ref={panelRef}>
        <div className="card">
          <h3 id="pay-settings-edit-title">{editTitle}</h3>
          <div className="grid-2">
            <div>
              <label htmlFor="ps-month">Gültig ab Monat</label>
              <input type="month" id="ps-month"
                value={draft?.month ?? ''}
                disabled={!isAdd || locked}
                onChange={e => setDraft(d => d ? { ...d, month: e.target.value } : d)} />
            </div>
          </div>
          <div id="ps-locked-warn" className="warn" hidden={!locked} style={{ marginTop: 10 }}>
            In dieser Periode existieren bereits Einsätze. Die Sätze sind gesperrt, damit bestehende Lohnabrechnungen nicht rückwirkend geändert werden. Lösche zuerst die Einsätze in dieser Periode, oder lege eine neue Version für einen späteren Monat an.
          </div>
        </div>

        <div className="card">
          <h3>Zulagen</h3>
          <div className="grid-2">
            {PS_NUMERIC_FIELDS.slice(0, 1).map(f => (
              <div key={f.domId}>
                <label htmlFor={f.domId}>{f.label}</label>
                <input type="number" id={f.domId} step={f.step} min="0"
                  value={draft?.fields[f.key] ?? ''}
                  disabled={locked}
                  onChange={e => setDraft(d => d ? { ...d, fields: { ...d.fields, [f.key]: e.target.value } } : d)} />
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Der <strong>Stundenlohn</strong> wird pro Person im Bereich „Mitarbeitende" festgelegt. Der Ferienanspruch (4/5/6 Wochen) wird ebenfalls pro Person dort gewählt. Diese Sätze hier gelten haushaltsweit für alle Mitarbeitenden.</p>
        </div>

        <div className="card">
          <h3>Sozialversicherungs-Beitragssätze (%)</h3>
          <div className="grid-3">
            {PS_NUMERIC_FIELDS.slice(1, 8).map(f => (
              <div key={f.domId}>
                <label htmlFor={f.domId}>{f.label}</label>
                <input type="number" id={f.domId} step={f.step} min="0"
                  value={draft?.fields[f.key] ?? ''}
                  disabled={locked}
                  onChange={e => setDraft(d => d ? { ...d, fields: { ...d.fields, [f.key]: e.target.value } } : d)} />
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>UVG (Unfallversicherung)</h3>
          <div className="checkbox-row">
            <input type="checkbox" id="ps-uvg-enabled"
              checked={draft?.uvgEnabled ?? false}
              disabled={locked}
              onChange={e => setDraft(d => d ? { ...d, uvgEnabled: e.target.checked } : d)} />
            <label htmlFor="ps-uvg-enabled">UVG via SVA Zürich abrechnen (VAVplus). Wenn deaktiviert: separate UVG abschliessen und ausserhalb dieses Tools abrechnen.</label>
          </div>
          <div className="grid-2">
            {PS_NUMERIC_FIELDS.slice(8).map(f => (
              <div key={f.domId}>
                <label htmlFor={f.domId}>{f.label}</label>
                <input type="number" id={f.domId} step={f.step} min="0"
                  value={draft?.fields[f.key] ?? ''}
                  disabled={locked}
                  onChange={e => setDraft(d => d ? { ...d, fields: { ...d.fields, [f.key]: e.target.value } } : d)} />
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div id="pay-settings-form-error" className="auth-error" hidden={!formError}>{formError}</div>
          <div className="btn-row">
            <button className="btn" id="btn-save-pay-settings" hidden={locked} onClick={onSave}>Speichern</button>
            <button className="btn btn-secondary" id="btn-cancel-pay-settings" onClick={closeEdit}>Abbrechen</button>
            <button className="btn btn-danger" id="btn-delete-pay-settings" hidden={isAdd || locked} onClick={onDelete}>Version löschen</button>
          </div>
        </div>
      </div>

      <AccountCard />

      <div className="card">
        <h3>Daten verwalten</h3>
        <div className="btn-row">
          <button className="btn btn-secondary" id="btn-export" onClick={onExport}>Export JSON</button>
          <button className="btn btn-secondary" id="btn-import" onClick={() => importFileRef.current?.click()}>Import JSON</button>
          <input type="file" id="import-file" accept="application/json" style={{ display: 'none' }}
            ref={importFileRef} onChange={onImportFile} />
          <button className="btn btn-danger" id="btn-clear-all" onClick={onClearAll}>Alle Daten löschen</button>
        </div>
        <div className="info" style={{ marginTop: 12 }}>Alle Daten werden in deinem Supabase-Haushalt gespeichert und sind auf jedem angemeldeten Gerät verfügbar.</div>
      </div>
    </section>
  );
}
