import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase, getPendingInviteToken } from '../supabaseClient';
import { useApp } from '../context/AppContext';

export function LoginScreen() {
  const { ui, authError, setAuthError, loginWarning, setLoginWarning } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [inviteHousehold, setInviteHousehold] = useState<string | null>(null);

  const inviteToken = getPendingInviteToken();
  // Carrying the invite token as signup metadata lets handle_new_user join the
  // household synchronously at account creation (see the link_invites migration).
  const signupData = inviteToken ? { invite_token: inviteToken } : undefined;

  // Greet an invitee arriving via a link with the household they are joining.
  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('invite_info', { p_token: inviteToken });
      const row = Array.isArray(data) ? data[0] : data;
      if (!cancelled && !error && row?.household_name) setInviteHousehold(row.household_name);
    })();
    return () => { cancelled = true; };
  }, [inviteToken]);

  function resetMessages() {
    setAuthError(null);
    setInfo(null);
    setLoginWarning(null);
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
    resetMessages();
    const addr = validEmail();
    if (!addr) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { emailRedirectTo: location.href, data: signupData }
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

  async function onPasswordSignIn(ev: FormEvent) {
    ev.preventDefault();
    resetMessages();
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
      // SIGNED_IN event drives the rest of the flow.
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e);
      setAuthError('Anmeldung fehlgeschlagen: ' + msg);
    } finally {
      setPwBusy(false);
    }
  }

  async function onForgotPassword() {
    resetMessages();
    const addr = validEmail();
    if (!addr) return;
    setPwBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: location.href });
      if (error) throw error;
      setInfo(`E-Mail zum Festlegen eines neuen Passworts an ${addr} gesendet. Bitte Posteingang prüfen (auch Spam).`);
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e);
      setAuthError('Senden fehlgeschlagen: ' + msg);
    } finally {
      setPwBusy(false);
    }
  }

  async function onPasswordSignUp() {
    resetMessages();
    const addr = validEmail();
    if (!addr) return;
    if (!password || password.length < 8) {
      setAuthError('Bitte ein Passwort mit mindestens 8 Zeichen wählen.');
      return;
    }
    setPwBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: addr,
        password,
        options: { emailRedirectTo: location.href, data: signupData }
      });
      if (error) throw error;
      if (!data.session) {
        // E-mail confirmation enabled: the user has to confirm first.
        setInfo(`Bestätigungs-E-Mail an ${addr} gesendet. Bitte Posteingang prüfen, danach kannst du dich mit deinem Passwort anmelden.`);
      }
      // With confirmation disabled a session exists and SIGNED_IN takes over.
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e);
      setAuthError('Registrierung fehlgeschlagen: ' + msg);
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div id="login-screen" className="auth-screen" hidden={!ui.login}>
      <div className="auth-card">
        <h1>Salärli</h1>
        <p className="muted" style={{ marginTop: -6 }}>Lohnabrechnung für Angestellte im Privathaushalt</p>
        <div id="login-warning" className="warn" hidden={!loginWarning} style={{ textAlign: 'left', margin: '0 0 16px' }}>{loginWarning}</div>
        {inviteToken && (
          <div id="invite-greeting" className="success" style={{ textAlign: 'left', margin: '0 0 16px' }}>
            {inviteHousehold
              ? `Du wurdest zu „${inviteHousehold}“ eingeladen. Registriere dich mit deiner E-Mail-Adresse — danach bist du automatisch dabei.`
              : 'Du wurdest zu einem Haushalt eingeladen. Registriere dich mit deiner E-Mail-Adresse — danach bist du automatisch dabei.'}
          </div>
        )}
        <p>{inviteToken
          ? 'Neu hier? Wähle unten eine E-Mail-Adresse und ein Passwort und tippe auf „Neues Konto erstellen“. Schon registriert? Melde dich einfach an.'
          : 'Melde dich mit deiner E-Mail-Adresse an — per Anmelde-Link oder mit Passwort.'}</p>
        <form id="magic-link-form" noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={onMagicLink}>
          <input
            type="email" id="login-email" placeholder="dein.name@example.com" required
            autoComplete="email" style={{ textAlign: 'center' }}
            value={email} onChange={e => setEmail(e.target.value)}
          />
          <button type="submit" id="btn-magic-link" className="btn" disabled={sending}>
            {sending ? 'Wird gesendet …' : 'Anmelde-Link senden'}
          </button>
        </form>
        <div className="muted" style={{ margin: '14px 0 10px', fontSize: 13 }}>oder mit Passwort</div>
        <form id="password-form" noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={onPasswordSignIn}>
          <input
            type="password" id="login-password" placeholder="Passwort"
            autoComplete="current-password" style={{ textAlign: 'center' }}
            value={password} onChange={e => setPassword(e.target.value)}
          />
          <button type="submit" id="btn-password-signin" className="btn" disabled={pwBusy}>
            {pwBusy ? 'Wird geprüft …' : 'Mit Passwort anmelden'}
          </button>
          <button type="button" id="btn-password-signup" className="btn btn-secondary" disabled={pwBusy}
            onClick={onPasswordSignUp}>
            Neues Konto erstellen
          </button>
        </form>
        <button type="button" id="btn-forgot-password" disabled={pwBusy}
          style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', marginTop: 12, fontSize: 13, fontFamily: 'inherit', textDecoration: 'underline' }}
          onClick={onForgotPassword}>
          Passwort vergessen oder noch keins festgelegt?
        </button>
        <div id="auth-info" className="success" hidden={!info} style={{ marginTop: 14, textAlign: 'left' }}>{info}</div>
        <div id="auth-error" className="auth-error" hidden={!authError}>{authError}</div>
      </div>
    </div>
  );
}
