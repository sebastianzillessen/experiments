import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../supabaseClient';
import { useApp } from '../context/AppContext';

export function CreateHouseholdScreen() {
  const { ui, user, refreshSignedIn } = useApp();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Prefill + focus when the overlay becomes visible (mirrors showCreateHousehold).
  useEffect(() => {
    if (!ui.create) return;
    setError(null);
    setName(prev => {
      if (prev) return prev;
      const guess = user?.email ? user.email.split('@')[0] : '';
      return guess ? `${guess} Haushalt` : 'Mein Haushalt';
    });
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [ui.create, user]);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Bitte einen Namen eingeben.');
      return;
    }
    setBusy(true);
    try {
      const { data: userCheck, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userCheck?.user) {
        throw new Error('Server akzeptiert die Sitzung nicht: ' + (userErr?.message || 'no user'));
      }
      const { error } = await supabase.rpc('create_household_for_self', { p_name: trimmed });
      if (error) throw error;
      await refreshSignedIn();
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e);
      setError('Anlegen fehlgeschlagen: ' + msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="create-household-screen" className="auth-screen" hidden={!ui.create}>
      <div className="auth-card">
        <h1>Haushalt anlegen</h1>
        <p>Du bist angemeldet, gehörst aber noch keinem Haushalt an. Erstelle einen — du wirst automatisch Owner und kannst danach weitere Personen einladen.</p>
        <form id="create-household-form" noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={onSubmit}>
          <input
            ref={inputRef}
            type="text" id="create-household-name" placeholder="z.B. Familie Muster" required
            style={{ textAlign: 'center' }}
            value={name} onChange={e => setName(e.target.value)}
          />
          <button type="submit" id="btn-create-household" className="btn" disabled={busy}>
            {busy ? 'Wird angelegt …' : 'Haushalt anlegen'}
          </button>
        </form>
        <button type="button" id="btn-create-household-signout" className="btn btn-secondary" style={{ marginTop: 10 }}
          onClick={() => { supabase.auth.signOut(); }}>
          Abmelden
        </button>
        <div id="create-household-error" className="auth-error" hidden={!error} style={{ marginTop: 14 }}>{error}</div>
      </div>
    </div>
  );
}
