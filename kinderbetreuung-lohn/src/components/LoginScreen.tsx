import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../supabaseClient';
import { useApp } from '../context/AppContext';

export function LoginScreen() {
  const { ui, authError, setAuthError } = useApp();
  const [email, setEmail] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setAuthError(null);
    setInfo(null);
    const addr = email.trim().toLowerCase();
    if (!addr || !addr.includes('@')) {
      setAuthError('Bitte gültige E-Mail-Adresse eingeben.');
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { emailRedirectTo: location.href }
      });
      if (error) throw error;
      setInfo(`Anmelde-Link an ${addr} gesendet. Bitte Posteingang prüfen (auch Spam).`);
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e);
      setAuthError('Senden fehlgeschlagen: ' + msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <div id="login-screen" className="auth-screen" hidden={!ui.login}>
      <div className="auth-card">
        <h1>Lohnabrechnung Kinderbetreuung</h1>
        <p>Trage deine E-Mail-Adresse ein. Du erhältst einen Anmelde-Link in deinem Posteingang.</p>
        <form id="magic-link-form" noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={onSubmit}>
          <input
            type="email" id="login-email" placeholder="dein.name@example.com" required
            autoComplete="email" style={{ textAlign: 'center' }}
            value={email} onChange={e => setEmail(e.target.value)}
          />
          <button type="submit" id="btn-magic-link" className="btn" disabled={sending}>
            {sending ? 'Wird gesendet …' : 'Anmelde-Link senden'}
          </button>
        </form>
        <div id="auth-info" className="success" hidden={!info} style={{ marginTop: 14, textAlign: 'left' }}>{info}</div>
        <div id="auth-error" className="auth-error" hidden={!authError}>{authError}</div>
      </div>
    </div>
  );
}
