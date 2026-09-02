import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../supabaseClient.ts';
import { useApp } from '../context/AppContext.tsx';
import { ROLE_LABELS } from '../lib/types.ts';
import type { Role } from '../lib/types.ts';
import { AppVersion } from './AppVersion.tsx';

// Same three ways in as Salärli — magic link, password, new account — against
// the same Supabase project, so an existing login works here immediately.
export function LoginScreen() {
  const { authError, setAuthError, loginWarning, setLoginWarning, inviteToken } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [invite, setInvite] = useState<{ family: string; role: Role } | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('fp_invite_info', { p_token: inviteToken });
      const row = Array.isArray(data) ? data[0] : data;
      if (!cancelled && !error && row?.family_name) {
        setInvite({ family: row.family_name, role: row.role as Role });
      }
    })();
    return () => { cancelled = true; };
  }, [inviteToken]);

  function reset() {
    setAuthError(null);
    setLoginWarning(null);
    setInfo(null);
  }

  function validEmail(): string | null {
    const addr = email.trim().toLowerCase();
    if (!addr || !addr.includes('@')) {
      setAuthError('Bitte gültige E-Mail-Adresse eingeben.');
      return null;
    }
    return addr;
  }

  async function onMagicLink(ev: FormEvent) {
    ev.preventDefault();
    reset();
    const addr = validEmail();
    if (!addr) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { emailRedirectTo: location.href },
      });
      if (error) throw error;
      setInfo(`Anmelde-Link an ${addr} gesendet. Bitte Posteingang prüfen (auch Spam).`);
    } catch (e) {
      setAuthError('Senden fehlgeschlagen: ' + ((e as { message?: string })?.message || String(e)));
    } finally {
      setSending(false);
    }
  }

  async function onPasswordSignIn(ev: FormEvent) {
    ev.preventDefault();
    reset();
    const addr = validEmail();
    if (!addr) return;
    if (!password) {
      setAuthError('Bitte Passwort eingeben.');
      return;
    }
    setPwBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: addr, password });
      if (error) throw error;
    } catch (e) {
      setAuthError('Anmeldung fehlgeschlagen: ' + ((e as { message?: string })?.message || String(e)));
    } finally {
      setPwBusy(false);
    }
  }

  async function onSignUp() {
    reset();
    const addr = validEmail();
    if (!addr) return;
    if (!password || password.length < 8) {
      setAuthError('Bitte ein Passwort mit mindestens 8 Zeichen wählen.');
      return;
    }
    setPwBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: addr, password, options: { emailRedirectTo: location.href },
      });
      if (error) throw error;
      if (!data.session) {
        setInfo(`Bestätigungs-E-Mail an ${addr} gesendet. Bitte Posteingang prüfen, danach kannst du dich anmelden.`);
      }
    } catch (e) {
      setAuthError('Registrierung fehlgeschlagen: ' + ((e as { message?: string })?.message || String(e)));
    } finally {
      setPwBusy(false);
    }
  }

  async function onForgotPassword() {
    reset();
    const addr = validEmail();
    if (!addr) return;
    setPwBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: location.href });
      if (error) throw error;
      setInfo(`E-Mail zum Festlegen eines neuen Passworts an ${addr} gesendet.`);
    } catch (e) {
      setAuthError('Senden fehlgeschlagen: ' + ((e as { message?: string })?.message || String(e)));
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Familienplaner</h1>
        <p className="muted">Die Woche der Familie — auf einen Blick</p>

        {loginWarning && <div className="notice warn" id="login-warning">{loginWarning}</div>}
        {inviteToken && (
          <div className="notice success" id="invite-greeting">
            {invite
              ? `Du wurdest zu „${invite.family}“ eingeladen (${ROLE_LABELS[invite.role]}). Melde dich an oder registriere dich — danach bist du dabei.`
              : 'Du wurdest zu einer Familie eingeladen. Melde dich an oder registriere dich — danach bist du dabei.'}
          </div>
        )}

        <form id="magic-link-form" noValidate onSubmit={onMagicLink} className="stack">
          <input
            type="email" id="login-email" placeholder="dein.name@example.com" required
            autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
          />
          <button type="submit" id="btn-magic-link" className="btn" disabled={sending}>
            {sending ? 'Wird gesendet …' : 'Anmelde-Link senden'}
          </button>
        </form>

        <div className="divider">oder mit Passwort</div>

        <form id="password-form" noValidate onSubmit={onPasswordSignIn} className="stack">
          <input
            type="password" id="login-password" placeholder="Passwort"
            autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
          />
          <button type="submit" id="btn-password-signin" className="btn" disabled={pwBusy}>
            {pwBusy ? 'Wird geprüft …' : 'Mit Passwort anmelden'}
          </button>
          <button type="button" id="btn-password-signup" className="btn btn-secondary" disabled={pwBusy} onClick={onSignUp}>
            Neues Konto erstellen
          </button>
        </form>

        <button type="button" id="btn-forgot-password" className="linklike" disabled={pwBusy} onClick={onForgotPassword}>
          Passwort vergessen oder noch keins festgelegt?
        </button>

        {info && <div className="notice success">{info}</div>}
        {authError && <div className="notice danger" id="auth-error">{authError}</div>}

        <div className="auth-footer"><AppVersion /></div>
      </div>
    </div>
  );
}
