import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useApp } from '../context/AppContext';
import type { Member, OpenInvite } from '../context/AppContext';
import { employeeById, employeeName } from '../lib/payroll';
import { fmtDate, roleLabel } from '../lib/format';

export function MitgliederTab() {
  const {
    activeTab, user, role, data, householdId, setSyncStatus,
    loadMembersList, reloadInvites, createInvite, createLinkInvite,
    unlinkEmployeeLogin, removeEmployeeFromHousehold
  } = useApp();
  const [members, setMembers] = useState<Member[] | null>(null); // null = loading
  const [invites, setInvites] = useState<OpenInvite[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<'employee' | 'admin'>('employee');
  const [linkRole, setLinkRole] = useState<'employee' | 'admin'>('employee');
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOwner = role === 'owner';
  const active = activeTab === 'mitglieder';

  const reload = useCallback(async () => {
    setMembers(null);
    setInvites(null);
    setLoadError(false);
    try {
      const [m, i] = await Promise.all([loadMembersList(), reloadInvites()]);
      setMembers(m);
      setInvites(i);
    } catch (e) {
      setSyncStatus('error', e);
      setLoadError(true);
      setMembers([]);
      setInvites([]);
    }
  }, [loadMembersList, reloadInvites, setSyncStatus]);

  // Mirrors renderMitglieder(): refetch every time the tab is opened.
  useEffect(() => {
    if (active && isOwner) reload();
  }, [active, isOwner, reload]);

  async function removeMember(userId: string) {
    if (!confirm('Mitglied wirklich entfernen?')) return;
    // If the member is linked to an employee record, revoke access AND detach the
    // record in one step so the link doesn't dangle (removeEmployeeFromHousehold
    // wraps the owner-only remove_member RPC + the unlink).
    const linkedEmp = data.employees.find(e => e.userId === userId);
    if (linkedEmp) {
      const ok = await removeEmployeeFromHousehold(linkedEmp.id!, userId);
      if (ok) reload();
      return;
    }
    setSyncStatus('pending');
    try {
      // Privileged delete via security-definer RPC. A direct
      // delete().select() can't confirm the removal: the memberships
      // SELECT policy only exposes the caller's own row, so DELETE …
      // RETURNING comes back empty for another member and looks like a
      // failure. The RPC enforces owner-only and returns the row count.
      const { data: count, error } = await supabase.rpc('remove_member', {
        p_household_id: householdId,
        p_user_id: userId
      });
      if (error) throw error;
      if (!count) {
        throw new Error(
          'Mitglied wurde nicht entfernt — evtl. bereits entfernt oder fehlende Rechte (nur Owner darf Mitglieder entfernen).'
        );
      }
      setSyncStatus('ok');
      reload();
    } catch (e) { setSyncStatus('error', e); }
  }

  async function unlinkMember(employeeId: string) {
    if (!confirm('Verknüpfung mit dem Mitarbeitenden-Eintrag aufheben?\n\nDie Person bleibt Mitglied des Haushalts, ist aber nicht mehr mit dem Eintrag verknüpft und kann keine eigenen Stunden mehr darauf erfassen. Stammdaten und bisherige Einsätze bleiben erhalten.')) return;
    const ok = await unlinkEmployeeLogin(employeeId);
    if (ok) reload();
  }

  async function revokeInvite(id: string) {
    if (!confirm('Einladung zurückziehen?')) return;
    setSyncStatus('pending');
    try {
      const { error } = await supabase.from('invites').delete().eq('id', id);
      if (error) throw error;
      setSyncStatus('ok');
      reload();
    } catch (e) { setSyncStatus('error', e); }
  }

  async function sendInvite() {
    const email = invEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { alert('Bitte gültige E-Mail-Adresse eingeben.'); return; }
    const ok = await createInvite({ email, role: invRole });
    if (ok) { setInvEmail(''); reload(); }
  }

  async function createLink() {
    setLinkBusy(true);
    setCopied(false);
    setGeneratedLink('');
    try {
      const url = await createLinkInvite({ role: linkRole });
      if (url) {
        setGeneratedLink(url);
        await copyLink(url);
        reload();
      }
    } finally {
      setLinkBusy(false);
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked (insecure context / permissions) — the link stays
      // visible in the field so it can be selected and copied manually.
      setCopied(false);
    }
  }

  return (
    <section id="mitglieder" role="tabpanel" aria-labelledby="tab-mitglieder" tabIndex={0}
      className={activeTab === 'mitglieder' ? 'active' : undefined}>
      <h2>Mitglieder &amp; Einladungen</h2>
      <div className="section-sub">Verwalte, wer auf diesen Haushalt Zugriff hat. Nur Owner.</div>

      <div className="card">
        <h3>Aktive Mitglieder</h3>
        <div id="members-list">
          {!isOwner ? (
            <div className="empty-state">Nur für Owner.</div>
          ) : loadError ? (
            <div className="empty-state">Fehler beim Laden.</div>
          ) : members === null ? (
            <div className="empty-state">Lade …</div>
          ) : !members.length ? (
            <div className="empty-state">Keine Mitglieder.</div>
          ) : (
            members.map(m => {
              const isSelf = m.user_id === user?.id;
              const showRemove = m.role !== 'owner' && !isSelf;
              const linkedEmp = data.employees.find(e => e.userId === m.user_id);
              const empNote = linkedEmp ? ` · Mitarbeiter/in: ${employeeName(linkedEmp)}` : '';
              return (
                <div className="member-row" key={m.user_id}>
                  <div className="info-block">
                    <div className="name">{m.full_name || m.email}</div>
                    <div className="meta">{m.email}{isSelf ? ' · du' : ''}{empNote}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className={`role-badge ${m.role}`}>{roleLabel(m.role)}</span>
                    {linkedEmp && !isSelf && (
                      <button className="btn btn-small btn-secondary" data-unlink={m.user_id}
                        onClick={() => unlinkMember(linkedEmp.id!)}>Verknüpfung aufheben</button>
                    )}
                    {showRemove && (
                      <button className="btn btn-small btn-danger" data-remove={m.user_id}
                        onClick={() => removeMember(m.user_id)}>Entfernen</button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="card">
        <h3>Offene Einladungen</h3>
        <div id="invites-list">
          {!isOwner || loadError ? null : invites === null ? (
            <div className="empty-state">Lade …</div>
          ) : !invites.length ? (
            <div className="empty-state">Keine offenen Einladungen.</div>
          ) : (
            invites.map(i => {
              const inviteEmp = i.employeeId ? employeeById(data, i.employeeId) : null;
              const empNote = inviteEmp ? ` · verknüpft mit ${employeeName(inviteEmp)}` : '';
              const isLink = !i.email && !!i.token;
              const linkUrl = isLink ? `${location.origin}${location.pathname}?invite=${i.token}` : '';
              return (
                <div className="member-row" key={i.id}>
                  <div className="info-block">
                    <div className="name">{i.email || 'Einladungs-Link (per URL)'}</div>
                    <div className="meta">eingeladen am {fmtDate(i.createdAt.slice(0, 10))}{empNote}
                      {isLink ? ' · noch nicht eingelöst' : ''}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className={`role-badge ${i.role}`}>{roleLabel(i.role)}</span>
                    {isLink && (
                      <button className="btn btn-small btn-secondary" data-copy={i.id}
                        onClick={() => copyLink(linkUrl)}>Link kopieren</button>
                    )}
                    <button className="btn btn-small btn-danger" data-revoke={i.id}
                      onClick={() => revokeInvite(i.id)}>Zurückziehen</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="card">
        <h3>Person einladen</h3>
        <div className="info">Die eingeladene Person erhält automatisch eine E-Mail mit einem Anmelde-Link. Nach dem Klick wird sie angemeldet und kann den Haushalt im Tool annehmen. (Klappt das nicht, kannst du den Tool-Link auch manuell teilen.)</div>
        <div className="grid-2">
          <div>
            <label htmlFor="inv-email">E-Mail-Adresse</label>
            <input type="email" id="inv-email" placeholder="person@example.com"
              value={invEmail} onChange={e => setInvEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="inv-role">Rolle</label>
            <select id="inv-role" value={invRole} onChange={e => setInvRole(e.target.value as 'employee' | 'admin')}>
              <option value="employee">Mitarbeitende/r — sieht nur Stundenerfassung, nur eigene Einsätze</option>
              <option value="admin">Admin — sieht und bearbeitet alles, ausser Mitglieder</option>
            </select>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn" id="btn-invite" onClick={sendInvite}>Einladen</button>
        </div>
      </div>

      <div className="card">
        <h3>Per Link einladen</h3>
        <div className="info">Du kennst die E-Mail-Adresse nicht? Erstelle einen Einladungs-Link und teile ihn direkt (z.&nbsp;B. per WhatsApp). Wer den Link öffnet, kann sich mit einer beliebigen E-Mail-Adresse registrieren und wird automatisch diesem Haushalt hinzugefügt. Jeder Link gilt für <strong>eine</strong> Person und wird beim Registrieren eingelöst.</div>
        <div className="grid-2">
          <div>
            <label htmlFor="link-role">Rolle</label>
            <select id="link-role" value={linkRole} onChange={e => setLinkRole(e.target.value as 'employee' | 'admin')}>
              <option value="employee">Mitarbeitende/r — sieht nur Stundenerfassung, nur eigene Einsätze</option>
              <option value="admin">Admin — sieht und bearbeitet alles, ausser Mitglieder</option>
            </select>
          </div>
        </div>
        {linkRole === 'employee' && (
          <div className="info" style={{ marginTop: 8 }}>Damit die Person eigene Stunden erfassen kann, muss ihr Login mit einem Mitarbeitenden-Eintrag verknüpft sein. Erstelle den Link am besten im Tab <strong>Mitarbeitende</strong> beim jeweiligen Eintrag — dann wird er automatisch verknüpft. Ein Link von hier lädt die Person nur als Mitglied ein (ohne Verknüpfung).</div>
        )}
        <div className="btn-row">
          <button className="btn" id="btn-create-link" onClick={createLink} disabled={linkBusy}>
            {linkBusy ? 'Wird erstellt …' : 'Einladungs-Link erstellen'}
          </button>
        </div>
        {generatedLink && (
          <div id="link-invite-result" style={{ marginTop: 12 }}>
            <label htmlFor="link-invite-url">Einladungs-Link</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="text" id="link-invite-url" readOnly value={generatedLink}
                onFocus={e => e.currentTarget.select()} style={{ flex: '1 1 240px' }} />
              <button className="btn btn-small btn-secondary" id="btn-copy-link"
                onClick={() => copyLink(generatedLink)}>{copied ? 'Kopiert ✓' : 'Kopieren'}</button>
            </div>
            <div className="info" style={{ marginTop: 6 }}>Teile diesen Link mit der Person. Er erscheint auch oben unter „Offene Einladungen“, bis er eingelöst wird.</div>
          </div>
        )}
      </div>
    </section>
  );
}
