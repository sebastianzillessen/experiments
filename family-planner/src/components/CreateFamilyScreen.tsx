import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../supabaseClient.ts';
import { useApp } from '../context/AppContext.tsx';

// Shown to a signed-in user who is not part of any family yet. Creating a
// family here is the only bootstrap path — there is deliberately no auth
// trigger, so signing up for Salärli never creates an empty family.
export function CreateFamilyScreen() {
  const { createFamily, user } = useApp();
  const [name, setName] = useState('');
  const [peopleText, setPeopleText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    const clean = name.trim();
    if (!clean) {
      setError('Bitte einen Namen für die Familie eingeben.');
      return;
    }
    setBusy(true);
    const people = peopleText.split(',').map(p => p.trim()).filter(Boolean);
    const ok = await createFamily(clean, people);
    setBusy(false);
    if (!ok) setError('Die Familie konnte nicht angelegt werden. Bitte später erneut versuchen.');
  }

  return (
    <div className="auth-screen">
      <form className="auth-card stack" onSubmit={onSubmit} noValidate>
        <h1>Familie anlegen</h1>
        <p className="muted">
          Du bist als <strong>{user?.email}</strong> angemeldet, gehörst aber noch zu keiner Familie.
          Wer schon einen Einladungslink hat, öffnet einfach diesen Link.
        </p>

        <label htmlFor="family-name">Name der Familie</label>
        <input id="family-name" value={name} onChange={e => setName(e.target.value)}
          placeholder="Familie Muster" autoFocus />

        <label htmlFor="family-people">Personen (Spalten im Planer), mit Komma getrennt</label>
        <input id="family-people" value={peopleText} onChange={e => setPeopleText(e.target.value)}
          placeholder="Caro, Basti, Lilly, Miri" />
        <p className="hint">Kannst du später jederzeit ändern.</p>

        {error && <div className="notice danger">{error}</div>}

        <button type="submit" className="btn" id="btn-create-family" disabled={busy}>
          {busy ? 'Wird angelegt …' : 'Familie anlegen'}
        </button>
        <button type="button" className="linklike" onClick={() => supabase.auth.signOut()}>
          Abmelden
        </button>
      </form>
    </div>
  );
}
