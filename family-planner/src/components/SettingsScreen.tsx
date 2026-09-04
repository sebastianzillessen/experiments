import { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { relativeStamp } from '../lib/dates.ts';
import { ROLE_LABELS } from '../lib/types.ts';
import type { Calendar, Person, Role, TimeFormat } from '../lib/types.ts';
import { Sheet } from './Sheet.tsx';
import { setKioskEnabled, useKioskSettings } from './KioskMode.tsx';
import { MenuSettings } from './MenuSettings.tsx';

type Tab = 'people' | 'calendars' | 'menu' | 'access' | 'display';

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const { isOwner } = useApp();
  const [tab, setTab] = useState<Tab>('people');

  return (
    <Sheet title="Einstellungen" onClose={onClose} wide>
      <div className="segmented settings-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'active' : ''}
          onClick={() => setTab('people')}>Personen</button>
        <button role="tab" aria-selected={tab === 'calendars'} className={tab === 'calendars' ? 'active' : ''}
          onClick={() => setTab('calendars')}>Kalender</button>
        <button role="tab" aria-selected={tab === 'menu'} className={tab === 'menu' ? 'active' : ''}
          onClick={() => setTab('menu')}>Menüplan</button>
        <button role="tab" aria-selected={tab === 'access'} className={tab === 'access' ? 'active' : ''}
          onClick={() => setTab('access')}>Zugriff</button>
        <button role="tab" aria-selected={tab === 'display'} className={tab === 'display' ? 'active' : ''}
          onClick={() => setTab('display')}>Anzeige</button>
      </div>

      {tab === 'people' && <PeopleSettings />}
      {tab === 'calendars' && (isOwner ? <CalendarSettings /> : <OwnerOnly what="Kalender" />)}
      {tab === 'menu' && <MenuSettings />}
      {tab === 'access' && (isOwner ? <AccessSettings /> : <OwnerOnly what="Zugriffsrechte" />)}
      {tab === 'display' && <DisplaySettings />}
    </Sheet>
  );
}

function OwnerOnly({ what }: { what: string }) {
  return <p className="muted">{what} kann nur der Owner der Familie verwalten.</p>;
}

/* ---------------------------------------------------------------- people */

function PeopleSettings() {
  const { people, canEdit, addPerson, deletePerson } = useApp();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Person | null>(null);

  if (!canEdit) {
    return (
      <ul className="settings-list">
        {people.map(p => (
          <li key={p.id}><span className="dot" style={{ background: p.color }} />{p.name}</li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <p className="hint">Jede Person ist eine Spalte im Planer — auch ohne eigenen Login.</p>
      <ul className="settings-list">
        {people.map(p => (
          <li key={p.id}>
            <span className="dot" style={{ background: p.color }} />
            <span className="grow">
              {p.name}
              {p.shortName && <span className="muted"> ({p.shortName})</span>}
              {p.aliases.length > 0 && <span className="hint"> · auch: {p.aliases.join(', ')}</span>}
            </span>
            <button className="linklike" onClick={() => setEditing(p)}>bearbeiten</button>
            <button className="linklike danger" onClick={() => deletePerson(p.id)}>entfernen</button>
          </li>
        ))}
      </ul>
      <form className="row" onSubmit={async ev => { ev.preventDefault(); if (name.trim()) { await addPerson(name); setName(''); } }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Neue Person" />
        <button className="btn" type="submit">Hinzufügen</button>
      </form>
      {editing && <PersonEditor person={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PersonEditor({ person, onClose }: { person: Person; onClose: () => void }) {
  const { updatePerson } = useApp();
  const [name, setName] = useState(person.name);
  const [shortName, setShortName] = useState(person.shortName ?? '');
  const [color, setColor] = useState(person.color);
  const [aliases, setAliases] = useState(person.aliases.join(', '));
  const [busy, setBusy] = useState(false);

  return (
    <Sheet title={`${person.name} bearbeiten`} onClose={onClose}>
      <div className="stack">
        <label htmlFor="p-name">Name</label>
        <input id="p-name" value={name} onChange={e => setName(e.target.value)} />

        <label htmlFor="p-short">Kürzel (Spaltenkopf auf dem Handy)</label>
        <input id="p-short" value={shortName} onChange={e => setShortName(e.target.value)} placeholder="z. B. Li" />

        <label htmlFor="p-color">Farbe</label>
        <input id="p-color" type="color" value={color} onChange={e => setColor(e.target.value)} />

        <label htmlFor="p-aliases">Auch erkennen als (Komma-getrennt)</label>
        <input id="p-aliases" value={aliases} onChange={e => setAliases(e.target.value)} placeholder="Lasse, L." />
        <p className="hint">
          Kalendertermine landen automatisch in dieser Spalte, wenn einer dieser Namen im Termin vorkommt.
        </p>

        <div className="sheet-actions">
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true);
            const ok = await updatePerson(person.id, {
              name, shortName, color,
              aliases: aliases.split(',').map(a => a.trim()).filter(Boolean),
            });
            setBusy(false);
            if (ok) onClose();
          }}>Speichern</button>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------- calendars */

function CalendarSettings() {
  const { calendars, family, refreshCalendars, deleteCalendar, sync } = useApp();
  const tz = family?.timezone ?? 'Europe/Zurich';
  const [form, setForm] = useState<Calendar | 'new' | null>(null);

  return (
    <>
      <ul className="settings-list">
        {calendars.map(c => (
          <li key={c.id} className="stacked">
            <div className="row-line">
              <span className="dot" style={{ background: c.color }} />
              <span className="grow"><strong>{c.label}</strong> <span className="muted">{c.urlPreview}</span></span>
              <button className="linklike" onClick={() => setForm(c)}>bearbeiten</button>
              <button className="linklike danger" onClick={() => deleteCalendar(c.id)}>entfernen</button>
            </div>
            <div className="hint">
              zuletzt synchronisiert: {relativeStamp(c.lastSyncedAt, tz, Date.now(), family?.timeFormat ?? '24h')}
              {!c.enabled && ' · deaktiviert'}
              {c.lastError && <span className="danger-text"> · Fehler: {c.lastError}</span>}
            </div>
          </li>
        ))}
        {calendars.length === 0 && <li className="muted">Noch kein Kalender verbunden.</li>}
      </ul>

      <div className="row">
        <button className="btn" onClick={() => setForm('new')}>Kalender verbinden</button>
        <button className="btn btn-secondary" onClick={() => refreshCalendars(true)} disabled={sync.busy}>
          Jetzt aktualisieren
        </button>
      </div>

      <h3>Später</h3>
      <ul className="settings-list muted">
        <li><input type="checkbox" disabled /> Office-365-Kalender verbinden <span className="hint">(in Vorbereitung)</span></li>
        <li><input type="checkbox" disabled /> Einträge in den Kalender zurückschreiben <span className="hint">(in Vorbereitung)</span></li>
      </ul>

      {form && <CalendarForm calendar={form === 'new' ? null : form} onClose={() => setForm(null)} />}
    </>
  );
}

function CalendarForm({ calendar, onClose }: { calendar: Calendar | null; onClose: () => void }) {
  const { upsertCalendar, refreshCalendars } = useApp();
  const [label, setLabel] = useState(calendar?.label ?? 'Familie');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [color, setColor] = useState(calendar?.color ?? '#8a7d64');
  const [enabled, setEnabled] = useState(calendar?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Sheet title={calendar ? 'Kalender bearbeiten' : 'Kalender verbinden'} onClose={onClose}>
      <div className="stack">
        <label htmlFor="c-label">Bezeichnung</label>
        <input id="c-label" value={label} onChange={e => setLabel(e.target.value)} />

        <label htmlFor="c-url">ICS-Adresse (geheime iCal-URL)</label>
        <input id="c-url" value={url} onChange={e => setUrl(e.target.value)} autoComplete="off"
          placeholder={calendar ? `${calendar.urlPreview} — leer lassen, um sie zu behalten` : 'https://… oder webcal://…'} />
        <p className="hint">
          Google: „Geheime Adresse im iCal-Format“. iCloud: den geteilten Kalender veröffentlichen
          und den <code>webcal://</code>-Link einsetzen — der wird automatisch auf https umgestellt.
        </p>
        <p className="hint">
          🔒 Die Adresse wird nur serverseitig gespeichert und nie an Mitglieder ausgeliefert —
          auch dir wird sie nach dem Speichern nicht mehr angezeigt.
        </p>

        <div className="row">
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Benutzer (optional)" autoComplete="off" />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Passwort (optional)" type="password" autoComplete="new-password" />
        </div>

        <div className="row">
          <label htmlFor="c-color">Farbe</label>
          <input id="c-color" type="color" value={color} onChange={e => setColor(e.target.value)} />
          <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> aktiv</label>
        </div>

        {error && <div className="notice danger">{error}</div>}

        <div className="sheet-actions">
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn" disabled={busy} onClick={async () => {
            if (!calendar && !url.trim()) { setError('Bitte die ICS-Adresse eingeben.'); return; }
            setBusy(true);
            const ok = await upsertCalendar({ id: calendar?.id, label, url, username, password, color, enabled });
            setBusy(false);
            if (!ok) { setError('Speichern fehlgeschlagen.'); return; }
            onClose();
            await refreshCalendars(true);
          }}>Speichern</button>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- access */

function AccessSettings() {
  const { members, openInvites, createLinkInvite, updateMemberRole, removeMember, user } = useApp();
  const [inviteRole, setInviteRole] = useState<Role>('viewer');
  const [link, setLink] = useState<string | null>(null);

  return (
    <>
      <ul className="settings-list">
        {members.map(m => (
          <li key={m.userId}>
            <span className="grow">{m.email ?? m.fullName ?? m.userId}</span>
            {m.userId === user?.id ? (
              <span className={`role-badge ${m.role}`}>{ROLE_LABELS[m.role]}</span>
            ) : (
              <>
                <select value={m.role} onChange={e => updateMemberRole(m.userId, e.target.value as Role)}>
                  <option value="owner">Owner</option>
                  <option value="editor">Bearbeiter</option>
                  <option value="viewer">Betrachter</option>
                </select>
                <button className="linklike danger" onClick={() => removeMember(m.userId)}>entfernen</button>
              </>
            )}
          </li>
        ))}
      </ul>

      <h3>Einladen</h3>
      <p className="hint">
        Der Link gilt für eine Person. Betrachter sehen den Plan, ändern aber nichts —
        gedacht für Grosseltern, Betreuung oder die grossen Kinder.
      </p>
      <div className="row">
        <select value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)}>
          <option value="viewer">Betrachter</option>
          <option value="editor">Bearbeiter</option>
        </select>
        <button className="btn" onClick={async () => setLink(await createLinkInvite(inviteRole))}>
          Einladungslink erstellen
        </button>
      </div>
      {link && (
        <div className="notice success">
          <code className="invite-link">{link}</code>
          <button className="linklike" onClick={() => navigator.clipboard?.writeText(link)}>kopieren</button>
        </div>
      )}

      {openInvites.length > 0 && (
        <>
          <h3>Offene Einladungen</h3>
          <ul className="settings-list">
            {openInvites.map(i => (
              <li key={i.id}>
                <span className="grow">{i.email ?? 'Einladungslink'}</span>
                <span className={`role-badge ${i.role}`}>{ROLE_LABELS[i.role]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/* --------------------------------------------------------------- display */

function DisplaySettings() {
  const { family, isOwner, setTimeFormat } = useApp();
  const [busy, setBusy] = useState(false);
  const current = family?.timeFormat ?? '24h';

  async function choose(format: TimeFormat) {
    if (format === current) return;
    setBusy(true);
    await setTimeFormat(format);
    setBusy(false);
  }

  const options: { value: TimeFormat; label: string; example: string }[] = [
    { value: '24h', label: '24 Stunden', example: '14:00–15:15' },
    { value: '12h', label: 'AM / PM', example: '2:00–3:15 PM' },
  ];

  return (
    <>
      <h3>Zeitformat</h3>
      <p className="hint">Gilt für die ganze Familie — jede/r sieht die Zeiten gleich.</p>
      <div className="stack">
        {options.map(o => (
          <label key={o.value} className="choice">
            <input type="radio" name="time-format" checked={current === o.value}
              disabled={!isOwner || busy} onChange={() => choose(o.value)} />
            <span className="grow">{o.label}</span>
            <span className="muted">{o.example}</span>
          </label>
        ))}
      </div>
      {!isOwner && <p className="hint">Ändern kann das nur der Owner der Familie.</p>}
      <p className="hint">
        Die Uhrzeit-Auswahl beim Erfassen ist die des Betriebssystems — welches Format sie zeigt,
        entscheidet dein Gerät (iOS: Einstellungen → Allgemein → Datum &amp; Uhrzeit → 24-Stunden-Zeit).
        Alles, was der Planer selbst schreibt, folgt der Einstellung hier.
      </p>

      <KioskSetting />
    </>
  );
}

/** Unlike the time format this belongs to the device, not to the family. */
function KioskSetting() {
  const kiosk = useKioskSettings();
  const idleMinutes = Math.round(kiosk.idleMs / 60_000);
  const refreshMinutes = Math.round(kiosk.refreshMs / 60_000);

  return (
    <>
      <h3>Kiosk-Modus</h3>
      <p className="hint">
        Nur für dieses Gerät — gedacht für ein iPad, das dauerhaft an der Wand hängt.
      </p>
      <label className="choice">
        <input type="checkbox" checked={kiosk.enabled}
          onChange={e => setKioskEnabled(e.target.checked)} />
        <span className="grow">Kiosk-Modus einschalten</span>
      </label>
      <p className="hint">
        Dunkle Darstellung, Bildschirm bleibt wach, nach {idleMinutes} Minuten ohne Berührung wird
        er schwarz (Antippen holt den Plan zurück), und die Kalender werden alle {refreshMinutes}{' '}
        Minuten abgerufen. Andere Zeiten über die Adresse: <code>?idle=10&amp;refresh=30</code>.
      </p>
    </>
  );
}
