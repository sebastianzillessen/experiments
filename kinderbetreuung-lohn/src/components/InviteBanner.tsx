import { supabase } from '../supabaseClient';
import { useApp } from '../context/AppContext';

export function InviteBanner() {
  const { ui, setSyncStatus, refreshSignedIn, hideInviteBanner } = useApp();
  const invite = ui.invite;

  const householdName = invite?.households?.name || 'einem Haushalt';

  async function accept() {
    if (!invite) return;
    setSyncStatus('pending');
    try {
      const { error } = await supabase.rpc('accept_invite', { invite_id: invite.id });
      if (error) throw error;
      hideInviteBanner();
      await refreshSignedIn();
    } catch (e) {
      setSyncStatus('error', e);
    }
  }

  async function decline() {
    hideInviteBanner();
    await supabase.auth.signOut();
  }

  return (
    <div id="invite-banner" className="invite-banner no-print" hidden={!invite}>
      <div className="text" id="invite-text">
        {invite ? `Du wurdest in „${householdName}“ als ${invite.role} eingeladen.` : ''}
      </div>
      <div className="actions">
        <button className="btn btn-small" id="btn-accept-invite" onClick={accept}>Einladung annehmen</button>
        <button className="btn btn-small btn-secondary" id="btn-decline-invite" onClick={decline}>Später</button>
      </div>
    </div>
  );
}
