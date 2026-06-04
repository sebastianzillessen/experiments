import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useApp } from '../context/AppContext';
import type { Member, Role } from '../context/AppContext';
import { fmtDate } from '../lib/format';

type InviteRow = { id: string; email: string; role: Role; created_at: string };

function openInviteFallbackMail(email: string, role: string) {
  // Fallback when the edge function is unreachable / not configured. Opens
  // the user's mail client with a German message ready to send.
  const subject = 'Einladung — Lohnabrechnung Kinderbetreuung';
  const body =
    `Hallo,\n\n` +
    `du wurdest als ${role} zu unserem Haushalt in „Lohnabrechnung Kinderbetreuung" eingeladen.\n\n` +
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

export function MitgliederTab() {
  const { activeTab, user, role, householdId, setSyncStatus, loadMembersList, loadInvitesList } = useApp();
  const [members, setMembers] = useState<Member[] | null>(null); // null = loading
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<'employee' | 'admin'>('employee');

  const isOwner = role === 'owner';
  const active = activeTab === 'mitglieder';

  const reload = useCallback(async () => {
    setMembers(null);
    setInvites(null);
    setLoadError(false);
    try {
      const [m, i] = await Promise.all([loadMembersList(), loadInvitesList()]);
      setMembers(m);
      setInvites(i);
    } catch (e) {
      setSyncStatus('error', e);
      setLoadError(true);
      setMembers([]);
      setInvites([]);
    }
  }, [loadMembersList, loadInvitesList, setSyncStatus]);

  // Mirrors renderMitglieder(): refetch every time the tab is opened.
  useEffect(() => {
    if (active && isOwner) reload();
  }, [active, isOwner, reload]);

  async function removeMember(userId: string) {
    if (!confirm('Mitglied wirklich entfernen?')) return;
    setSyncStatus('pending');
    try {
      // .select() so the response body returns the deleted rows. Without
      // it PostgREST returns 204 even when RLS filters every row, which
      // hid an earlier bug where the click looked successful but the
      // member stayed.
      const { data, error } = await supabase
        .from('memberships')
        .delete()
        .eq('household_id', householdId)
        .eq('user_id', userId)
        .select('user_id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          'Keine Zeile gelöscht. Vermutlich fehlen die nötigen Rechte (nur Owner darf Mitglieder entfernen) oder das Mitglied existiert nicht mehr.'
        );
      }
      setSyncStatus('ok');
      reload();
    } catch (e) { setSyncStatus('error', e); }
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
    setSyncStatus('pending');
    try {
      const { data: inserted, error } = await supabase
        .from('invites')
        .insert({
          household_id: householdId,
          email,
          role: invRole,
          invited_by: user?.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      setInvEmail('');
      setSyncStatus('ok');
      reload();

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
        if (useMailto) openInviteFallbackMail(email, invRole);
      } else {
        alert('Einladung an ' + email + ' versendet.');
      }
    } catch (e) {
      setSyncStatus('error', e);
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
              return (
                <div className="member-row" key={m.user_id}>
                  <div className="info-block">
                    <div className="name">{m.full_name || m.email}</div>
                    <div className="meta">{m.email}{isSelf ? ' · du' : ''}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className={`role-badge ${m.role}`}>{m.role}</span>
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
            invites.map(i => (
              <div className="member-row" key={i.id}>
                <div className="info-block">
                  <div className="name">{i.email}</div>
                  <div className="meta">eingeladen am {fmtDate(i.created_at.slice(0, 10))}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`role-badge ${i.role}`}>{i.role}</span>
                  <button className="btn btn-small btn-danger" data-revoke={i.id}
                    onClick={() => revokeInvite(i.id)}>Zurückziehen</button>
                </div>
              </div>
            ))
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
              <option value="employee">Employee — sieht nur Stundenerfassung, nur eigene Einsätze</option>
              <option value="admin">Admin — sieht und bearbeitet alles, ausser Mitglieder</option>
            </select>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn" id="btn-invite" onClick={sendInvite}>Einladen</button>
        </div>
      </div>
    </section>
  );
}
