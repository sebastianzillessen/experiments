import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../supabaseClient';
import { useApp } from '../context/AppContext';

// Overlay shown after the user followed a password-recovery link
// (PASSWORD_RECOVERY auth event). Sets the new password via updateUser.
export function SetPasswordScreen() {
  const { recoveryMode, setRecoveryMode } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!password || password.length < 8) {
      setError('Bitte ein Passwort mit mindestens 8 Zeichen wählen.');
      return;
    }
    if (password !== confirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setConfirm('');
      setRecoveryMode(false);
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e);
      setError('Speichern fehlgeschlagen: ' + msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="set-password-screen" className="auth-screen" hidden={!recoveryMode}>
      <div className="auth-card">
        <h1>Neues Passwort festlegen</h1>
        <p>Wähle ein neues Passwort für dein Konto. Danach kannst du dich jederzeit mit E-Mail und Passwort anmelden.</p>
        <form id="set-password-form" noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={onSubmit}>
          <input
            type="password" id="new-password" placeholder="Neues Passwort"
            autoComplete="new-password" style={{ textAlign: 'center' }}
            value={password} onChange={e => setPassword(e.target.value)}
          />
          <input
            type="password" id="new-password-confirm" placeholder="Passwort wiederholen"
            autoComplete="new-password" style={{ textAlign: 'center' }}
            value={confirm} onChange={e => setConfirm(e.target.value)}
          />
          <button type="submit" id="btn-set-password" className="btn" disabled={busy}>
            {busy ? 'Wird gespeichert …' : 'Passwort speichern'}
          </button>
        </form>
        <div id="set-password-error" className="auth-error" hidden={!error}>{error}</div>
      </div>
    </div>
  );
}
