import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useApp } from '../context/AppContext';
import { employeeById, employeeName, wageVersionHasShifts } from '../lib/payroll';
import { fmtChf, monthLabel } from '../lib/format';
import { normalizeEffectiveMonth, sanitizeEmployeeData } from '../lib/state';
import type { Employee, EmployeeData } from '../lib/state';

type MitUi = { mode: 'list'; empId: null } | { mode: 'add'; empId: null } | { mode: 'edit'; empId: string };

type FormFields = {
  name: string; address: string; zip: string; city: string;
  birthDate: string; ahvNumber: string; iban: string;
  vacationWeeks: number; weeklyHoursThreshold8h: boolean;
};

function fieldsFrom(d: EmployeeData): FormFields {
  return {
    name: d.name, address: d.address, zip: d.zip, city: d.city,
    birthDate: d.birthDate, ahvNumber: d.ahvNumber, iban: d.iban,
    vacationWeeks: d.vacationWeeks, weeklyHoursThreshold8h: d.weeklyHoursThreshold8h
  };
}

export function MitarbeitendeTab() {
  const {
    activeTab, data, role, openInvites, setSyncStatus,
    addEmployee, updateEmployee, addWage, updateWage, deleteWage,
    createInvite, reloadInvites
  } = useApp();
  const [mitUi, setMitUi] = useState<MitUi>({ mode: 'list', empId: null });
  const [fields, setFields] = useState<FormFields>(() => fieldsFrom(sanitizeEmployeeData({})));
  const [wageMonth, setWageMonth] = useState('');
  const [wageRate, setWageRate] = useState('');
  const [wageEdits, setWageEdits] = useState<Record<string, string>>({});
  const [wageError, setWageError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');

  const isAdmin = role === 'owner' || role === 'admin';

  function openAdd() {
    setMitUi({ mode: 'add', empId: null });
    setFields(fieldsFrom(sanitizeEmployeeData({})));
    setWageError(null);
    setWageEdits({});
  }

  function openEdit(emp: Employee) {
    setMitUi({ mode: 'edit', empId: emp.id! });
    setFields(fieldsFrom(emp.data));
    setWageError(null);
    setWageEdits({});
  }

  function closeForm() {
    setMitUi({ mode: 'list', empId: null });
    setWageError(null);
  }

  function readForm(): EmployeeData {
    return sanitizeEmployeeData({ ...fields, country: 'CH' });
  }

  async function onSave() {
    const d = readForm();
    if (!d.name.trim()) { alert('Bitte einen Namen eingeben.'); return; }
    if (mitUi.mode === 'add') {
      const id = await addEmployee(d);
      if (id) setMitUi({ mode: 'edit', empId: id }); // stay open to add a wage
    } else if (mitUi.mode === 'edit') {
      await updateEmployee(mitUi.empId, { data: d });
    }
  }

  async function onArchiveToggle(emp: Employee) {
    const archive = !emp.archivedAt;
    if (archive && !confirm('Mitarbeiter/in archivieren? Die Person erscheint dann nicht mehr zur Auswahl, Einsätze und Abrechnungen bleiben erhalten.')) return;
    await updateEmployee(emp.id!, { archived_at: archive ? new Date().toISOString() : null });
  }

  async function onWageAdd(empId: string) {
    setWageError(null);
    const month = normalizeEffectiveMonth(wageMonth);
    const rate = Number(wageRate);
    if (!month) { setWageError('Bitte einen gültigen Monat wählen.'); return; }
    if (!Number.isFinite(rate) || rate < 0) { setWageError('Bitte einen gültigen Stundenlohn eingeben.'); return; }
    if ((data.wages[empId] || []).some(w => w.effectiveMonth === month)) { setWageError('Für diesen Monat existiert bereits eine Lohn-Version.'); return; }
    if (data.shifts.some(s => s.employeeId === empId && s.date >= month)) {
      setWageError('Es existieren bereits Einsätze am oder nach diesem Monat — der Lohn würde rückwirkend gelten. Bitte späteren Monat wählen.');
      return;
    }
    const ok = await addWage(empId, month, rate);
    if (ok) { setWageMonth(''); setWageRate(''); }
  }

  async function onInvite(empId: string) {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { alert('Bitte gültige E-Mail-Adresse eingeben.'); return; }
    const ok = await createInvite({ email, role: 'employee', employeeId: empId });
    if (ok) {
      setInviteEmail('');
      try { await reloadInvites(); } catch (e) { console.warn(e); }
    }
  }

  async function onInviteRevoke(inviteId: string) {
    if (!confirm('Offene Einladung zurückziehen?')) return;
    setSyncStatus('pending');
    try {
      const { error } = await supabase.from('invites').delete().eq('id', inviteId);
      if (error) throw error;
      setSyncStatus('ok');
      await reloadInvites().catch(() => {});
    } catch (e) { setSyncStatus('error', e); }
  }

  const editingEmp = mitUi.mode === 'edit' ? employeeById(data, mitUi.empId) : null;
  const showForm = mitUi.mode === 'add' || (mitUi.mode === 'edit' && !!editingEmp);
  const linked = !!(editingEmp && editingEmp.userId);
  const wages = editingEmp?.id ? (data.wages[editingEmp.id] || []) : [];
  const pendingInvite = editingEmp?.id ? openInvites.find(i => i.employeeId === editingEmp.id) : null;

  return (
    <section id="mitarbeitende" role="tabpanel" aria-labelledby="tab-mitarbeitende" tabIndex={0}
      className={activeTab === 'mitarbeitende' ? 'active' : undefined}>
      <h2>Mitarbeitende</h2>
      <div className="section-sub">Lege je Person Stammdaten und einen eigenen, versionierten Stundenlohn an. Optional kannst du eine Person einladen, damit sie sich anmelden und eigene Stunden erfassen kann.</div>
      <div id="mitarbeitende-root">
        {!isAdmin ? null : (
          <>
            <div className="card">
              <h3>Mitarbeitende</h3>
              <div className="section-sub">Jede Person hat eigene Stammdaten und einen eigenen, versionierten Stundenlohn. Archivierte Personen behalten ihre Einsätze und Abrechnungen.</div>
              {!data.employees.length ? (
                <div className="empty-state">Noch keine Mitarbeitenden. Lege die erste Person an.</div>
              ) : (
                data.employees.map(emp => {
                  const archived = !!emp.archivedAt;
                  const wageCount = (data.wages[emp.id!] || []).length;
                  return (
                    <div className="member-row" key={emp.id} style={archived ? { opacity: 0.6 } : undefined}>
                      <div className="info-block">
                        <div className="name">{employeeName(emp)}</div>
                        <div className="meta">
                          {wageCount ? `${wageCount} Lohn-Version(en)` : 'kein Stundenlohn'}
                          {emp.data.iban ? ' · IBAN hinterlegt' : ''}{' '}
                          {emp.userId ? <span className="role-badge employee">Login</span> : null}{' '}
                          {archived ? <span className="muted">archiviert</span> : null}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="btn btn-small" data-emp-edit={emp.id!} onClick={() => openEdit(emp)}>Bearbeiten</button>
                        <button className="btn btn-small btn-secondary" data-emp-archive={emp.id!} onClick={() => onArchiveToggle(emp)}>
                          {archived ? 'Reaktivieren' : 'Archivieren'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              <div className="btn-row"><button className="btn" id="mit-add" onClick={openAdd}>Mitarbeiter/in hinzufügen</button></div>
            </div>

            {showForm && (
              <>
                <div className="card">
                  <h3>{mitUi.mode === 'edit' ? 'Mitarbeiter/in bearbeiten' : 'Neue/r Mitarbeiter/in'}</h3>
                  {linked && <div className="info" style={{ marginBottom: 12 }}>Mit einem Login verknüpft — diese Person kann sich anmelden und eigene Stunden erfassen.</div>}
                  <div className="grid-2">
                    <div><label htmlFor="emp-f-name">Name</label><input type="text" id="emp-f-name" placeholder="Erika Beispiel" value={fields.name} onChange={e => setFields(f => ({ ...f, name: e.target.value }))} /></div>
                    <div><label htmlFor="emp-f-address">Strasse &amp; Nr.</label><input type="text" id="emp-f-address" placeholder="Musterweg 5" value={fields.address} onChange={e => setFields(f => ({ ...f, address: e.target.value }))} /></div>
                    <div><label htmlFor="emp-f-zip">PLZ</label><input type="text" id="emp-f-zip" inputMode="numeric" placeholder="8400" value={fields.zip} onChange={e => setFields(f => ({ ...f, zip: e.target.value }))} /></div>
                    <div><label htmlFor="emp-f-city">Ort</label><input type="text" id="emp-f-city" placeholder="Winterthur" value={fields.city} onChange={e => setFields(f => ({ ...f, city: e.target.value }))} /></div>
                    <div><label htmlFor="emp-f-birth">Geburtsdatum</label><input type="date" id="emp-f-birth" value={fields.birthDate} onChange={e => setFields(f => ({ ...f, birthDate: e.target.value }))} /></div>
                    <div><label htmlFor="emp-f-ahv">AHV-Nr.</label><input type="text" id="emp-f-ahv" placeholder="756.0000.0000.00" value={fields.ahvNumber} onChange={e => setFields(f => ({ ...f, ahvNumber: e.target.value }))} /></div>
                    <div><label htmlFor="emp-f-iban">IBAN für Lohnzahlung</label><input type="text" id="emp-f-iban" placeholder="CH00 0000 0000 0000 0000 0" value={fields.iban} onChange={e => setFields(f => ({ ...f, iban: e.target.value }))} /></div>
                    <div>
                      <label htmlFor="emp-f-vacation">Ferienanspruch</label>
                      <select id="emp-f-vacation" value={String(fields.vacationWeeks)}
                        onChange={e => setFields(f => ({ ...f, vacationWeeks: Number(e.target.value) || 4 }))}>
                        <option value="4">4 Wochen (8.33 %)</option>
                        <option value="5">5 Wochen (10.63 %)</option>
                        <option value="6">6 Wochen (13.04 %)</option>
                      </select>
                    </div>
                  </div>
                  <div className="checkbox-row">
                    <input type="checkbox" id="emp-f-8h" checked={fields.weeklyHoursThreshold8h}
                      onChange={e => setFields(f => ({ ...f, weeklyHoursThreshold8h: e.target.checked }))} />
                    <label htmlFor="emp-f-8h">Arbeitet ≥ 8 Stunden pro Woche beim selben Arbeitgeber (Pflicht NBU-Versicherung)</label>
                  </div>
                  <div className="btn-row">
                    <button className="btn" id="emp-save" onClick={onSave}>Speichern</button>
                    <button className="btn btn-secondary" id="emp-cancel" onClick={closeForm}>Abbrechen</button>
                  </div>
                </div>

                {mitUi.mode === 'edit' && editingEmp?.id && (
                  <div className="card">
                    <h3>Stundenlohn (versioniert)</h3>
                    <div className="section-sub">Eine Lohnerhöhung legst du als neue Version „gültig ab" an. Frühere Versionen sind gesperrt, sobald Einsätze in deren Periode liegen.</div>
                    {!wages.length ? (
                      <div className="empty-state">Noch kein Stundenlohn hinterlegt.</div>
                    ) : (
                      wages.map(w => {
                        const locked = wageVersionHasShifts(data, editingEmp.id!, w);
                        return (
                          <div className="member-row" key={w.id}>
                            <div className="info-block">
                              <div className="name">ab {monthLabel(w.effectiveMonth.slice(0, 7))}</div>
                              <div className="meta">CHF {fmtChf(w.hourlyRate)} / Stunde {locked ? '· 🔒 gesperrt (Einsätze vorhanden)' : ''}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {!locked && (
                                <>
                                  <input type="number" step="0.01" min="0"
                                    value={wageEdits[w.id!] ?? String(w.hourlyRate)}
                                    data-wage-rate={w.id!}
                                    style={{ width: 90 }}
                                    onChange={e => setWageEdits(prev => ({ ...prev, [w.id!]: e.target.value }))} />
                                  <button className="btn btn-small" data-wage-save={w.id!}
                                    onClick={async () => {
                                      const rate = Number(wageEdits[w.id!] ?? w.hourlyRate);
                                      if (!Number.isFinite(rate) || rate < 0) { setWageError('Bitte einen gültigen Stundenlohn eingeben.'); return; }
                                      await updateWage(editingEmp.id!, w.id!, rate);
                                    }}>Speichern</button>
                                  <button className="btn btn-small btn-danger" data-wage-del={w.id!}
                                    onClick={async () => {
                                      if (!confirm('Diese Lohn-Version löschen?')) return;
                                      await deleteWage(editingEmp.id!, w.id!);
                                    }}>Löschen</button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div className="grid-3" style={{ marginTop: 10 }}>
                      <div><label htmlFor="wage-new-month">Gültig ab Monat</label><input type="month" id="wage-new-month" value={wageMonth} onChange={e => setWageMonth(e.target.value)} /></div>
                      <div><label htmlFor="wage-new-rate">Stundenlohn (CHF)</label><input type="number" id="wage-new-rate" step="0.01" min="0" placeholder="z.B. 30.00" value={wageRate} onChange={e => setWageRate(e.target.value)} /></div>
                      <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn" id="wage-add" onClick={() => onWageAdd(editingEmp.id!)}>Lohn-Version hinzufügen</button></div>
                    </div>
                    <div id="wage-form-error" className="auth-error" hidden={!wageError} style={{ marginTop: 8 }}>{wageError}</div>
                  </div>
                )}

                {mitUi.mode === 'edit' && editingEmp?.id && !linked && (
                  pendingInvite ? (
                    <div className="card">
                      <h3>Login verknüpfen (optional)</h3>
                      <div className="info" style={{ marginBottom: 12 }}>Einladung an <strong>{pendingInvite.email}</strong> ist offen. Sobald die Person den Anmelde-Link annimmt, wird ihr Login automatisch mit diesem Eintrag verknüpft.</div>
                      <div className="btn-row">
                        <button className="btn btn-danger" id="emp-invite-revoke" data-invite-id={pendingInvite.id}
                          onClick={() => onInviteRevoke(pendingInvite.id)}>Einladung zurückziehen</button>
                      </div>
                    </div>
                  ) : (
                    <div className="card">
                      <h3>Login verknüpfen (optional)</h3>
                      <div className="section-sub">Lade die Person ein, damit sie sich anmelden und ihre eigenen Stunden erfassen kann. Ohne Einladung bleibt dieser Eintrag reine Stammdaten.</div>
                      <div className="grid-2">
                        <div><label htmlFor="emp-invite-email">E-Mail-Adresse</label><input type="email" id="emp-invite-email" placeholder="person@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} /></div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn" id="emp-invite-btn" onClick={() => onInvite(editingEmp.id!)}>Als Mitarbeitende/r einladen</button></div>
                      </div>
                    </div>
                  )
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
