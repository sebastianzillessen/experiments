import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import {
  HUTTEN_DOWNLOADS, HUTTEN_PATTERNS, isoWeek, todayInZone,
} from '../../supabase/functions/family-menu-import/menu.ts';
import {
  EXAMPLE_WEEK, EXAMPLE_YEAR, expandPattern, isSafeMenuBase, PLACEHOLDERS, resolveMenuUrl,
  unknownPlaceholders,
} from '../../supabase/functions/family-menu-import/patterns.ts';
import type { MenuSource } from '../lib/types.ts';
import { Sheet } from './Sheet.tsx';

const WEEKDAYS = [
  { value: 1, label: 'Mo' }, { value: 2, label: 'Di' }, { value: 3, label: 'Mi' },
  { value: 4, label: 'Do' }, { value: 5, label: 'Fr' },
];

/**
 * Where the lunch menu comes from, who eats it, and which weeks are in.
 *
 * Everything an owner needs to point the importer at a school: the folder, the
 * file names, and which children eat there on which days.
 */
export function MenuSettings() {
  const { menuSources, isOwner } = useApp();
  const [form, setForm] = useState<MenuSource | 'new' | null>(null);

  return (
    <>
      <p className="hint">
        Der Menüplan der Schule wird aus dem wöchentlichen PDF gelesen und bei den Kindern
        angezeigt, die an dem Tag dort essen.
      </p>

      {menuSources.map(source => <MenuSourceCard key={source.id} source={source} />)}
      {menuSources.length === 0 && (
        <p className="muted">Noch keine Quelle eingerichtet.</p>
      )}

      {isOwner ? (
        <div className="row">
          <button className="btn" onClick={() => setForm('new')}>Quelle hinzufügen</button>
        </div>
      ) : (
        <p className="hint">Quellen einrichten kann nur der Owner der Familie.</p>
      )}

      {form && <MenuSourceForm source={form === 'new' ? null : form} onClose={() => setForm(null)} />}
    </>
  );
}

function MenuSourceCard({ source }: { source: MenuSource }) {
  const {
    family, people, menuWeeks, menuAssignments, isOwner, canEdit, sync,
    deleteMenuSource, setMenuAssignment, removeMenuAssignment, importMenuWeek, deleteMenuWeek,
  } = useApp();
  const tz = family?.timezone ?? 'Europe/Zurich';
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weeks = menuWeeks.filter(w => w.sourceId === source.id).slice().reverse();
  const eaters = menuAssignments.filter(a => a.sourceId === source.id);
  const current = useMemo(() => isoWeek(todayInZone(tz)), [tz]);

  async function importWeek(year: number, week: number) {
    setError(await importMenuWeek(source.id, year, week));
  }

  return (
    <div className="menu-source">
      <div className="row-line">
        <span className="grow">
          <strong>{source.label}</strong>
          {!source.enabled && <span className="muted"> · deaktiviert</span>}
          <span className="hint"> {source.baseUrl}</span>
        </span>
        {isOwner && <button className="linklike" onClick={() => setEditing(true)}>bearbeiten</button>}
        {isOwner && (
          <button className="linklike danger" onClick={() => deleteMenuSource(source.id)}>
            entfernen
          </button>
        )}
      </div>

      <h3>Wer isst dort</h3>
      {people.length === 0 && <p className="muted">Erst Personen anlegen.</p>}
      <ul className="settings-list">
        {people.map(person => {
          const eats = eaters.find(a => a.personId === person.id);
          return (
            <li key={person.id}>
              <label className="choice grow">
                <input type="checkbox" checked={Boolean(eats)} disabled={!canEdit}
                  onChange={e => (e.target.checked
                    ? setMenuAssignment(source.id, person.id, [1, 2, 3, 4, 5])
                    : removeMenuAssignment(source.id, person.id))} />
                <span className="dot" style={{ background: person.color }} />
                <span className="grow">{person.name}</span>
              </label>
              {eats && (
                <span className="weekday-picker">
                  {WEEKDAYS.map(day => (
                    <button key={day.value} type="button" disabled={!canEdit}
                      className={eats.weekdays.includes(day.value) ? 'active' : ''}
                      aria-pressed={eats.weekdays.includes(day.value)}
                      onClick={() => {
                        const next = eats.weekdays.includes(day.value)
                          ? eats.weekdays.filter(d => d !== day.value)
                          : [...eats.weekdays, day.value].sort();
                        // The last day cannot go: a child who eats there on no
                        // day is a child who does not eat there.
                        if (next.length === 0) removeMenuAssignment(source.id, person.id);
                        else setMenuAssignment(source.id, person.id, next);
                      }}>
                      {day.label}
                    </button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <h3>Wochen</h3>
      {error && <div className="notice danger">{error}</div>}
      {canEdit && (
        <div className="row">
          <button className="btn" disabled={sync.busy}
            onClick={() => importWeek(current.year, current.week)}>
            Diese Woche holen (KW {current.week})
          </button>
          <button className="btn btn-secondary" disabled={sync.busy}
            onClick={() => {
              const next = current.week + 1;
              // Week 53 exists in some years; the importer checks the range.
              importWeek(next > 53 ? current.year + 1 : current.year, next > 53 ? 1 : next);
            }}>
            Nächste Woche
          </button>
        </div>
      )}
      {sync.busy && <p className="hint">Der Menüplan wird gelesen …</p>}

      <ul className="settings-list">
        {weeks.map(week => (
          <li key={week.id}>
            <span className="grow">
              <strong>KW {week.week}</strong> <span className="muted">{week.from} – {week.to}</span>
              <span className="hint"> · {week.days.length} Tage gelesen</span>
            </span>
            {canEdit && (
              <button className="linklike danger" onClick={() => deleteMenuWeek(week.id)}>
                entfernen
              </button>
            )}
          </li>
        ))}
        {weeks.length === 0 && <li className="muted">Noch nichts geholt.</li>}
      </ul>

      {editing && <MenuSourceForm source={source} onClose={() => setEditing(false)} />}
    </div>
  );
}

function MenuSourceForm({ source, onClose }: { source: MenuSource | null; onClose: () => void }) {
  const { upsertMenuSource } = useApp();
  const [label, setLabel] = useState(source?.label ?? 'Schule');
  const [baseUrl, setBaseUrl] = useState(source?.baseUrl ?? HUTTEN_DOWNLOADS);
  const [patterns, setPatterns] = useState((source?.pathPatterns ?? HUTTEN_PATTERNS).join('\n'));
  const [enabled, setEnabled] = useState(source?.enabled ?? true);
  const [busy, setBusy] = useState(false);

  const lines = patterns.split('\n').map(p => p.trim()).filter(Boolean);
  const baseOk = isSafeMenuBase(baseUrl.trim());
  const unknown = [...new Set(lines.flatMap(unknownPlaceholders))];
  // Show what the patterns actually resolve to. Guessing from a pattern is
  // exactly the thing nobody should have to do in their head.
  const previews = lines.map(pattern => ({
    pattern,
    url: baseOk ? resolveMenuUrl(baseUrl.trim(), pattern, EXAMPLE_YEAR, EXAMPLE_WEEK) : null,
  }));

  return (
    <Sheet title={source ? `${source.label} bearbeiten` : 'Menüplan-Quelle'} onClose={onClose} wide>
      <div className="stack">
        <label htmlFor="m-label">Bezeichnung</label>
        <input id="m-label" value={label} onChange={e => setLabel(e.target.value)} />

        <label htmlFor="m-base">Basis-Adresse</label>
        <input id="m-base" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
          placeholder="https://…/downloads/" />
        {!baseOk && baseUrl.trim() !== '' && (
          <p className="hint danger-text">
            Nur https-Adressen, und keine Adressen im lokalen Netz.
          </p>
        )}

        <label htmlFor="m-patterns">Dateinamen — eine Zeile pro Muster</label>
        <textarea id="m-patterns" rows={3} value={patterns}
          onChange={e => setPatterns(e.target.value)} />
        <p className="hint">
          Die Muster werden der Reihe nach ausprobiert, bis eines gefunden wird. Das hilft bei
          Schulen, die mal <code>7.26.pdf</code> und mal <code>07.26.pdf</code> schreiben.
        </p>

        <details>
          <summary>Verfügbare Platzhalter</summary>
          <ul className="settings-list">
            {PLACEHOLDERS.map(p => (
              <li key={p.token}>
                <code className="grow">{p.token}</code>
                <span className="grow">{p.label}</span>
                <span className="muted">{p.example}</span>
              </li>
            ))}
          </ul>
          <p className="hint">Beispiele für KW {EXAMPLE_WEEK}/{EXAMPLE_YEAR}, Montag 9. Februar.</p>
        </details>

        {unknown.length > 0 && (
          <p className="hint danger-text">
            Unbekannte Platzhalter, die so stehen bleiben: {unknown.join(', ')}
          </p>
        )}

        {previews.length > 0 && (
          <>
            <label>Ergibt für KW {EXAMPLE_WEEK}/{EXAMPLE_YEAR}</label>
            <ul className="settings-list">
              {previews.map(({ pattern, url }) => (
                <li key={pattern}>
                  <span className="grow pre">
                    {url ?? `${expandPattern(pattern, EXAMPLE_YEAR, EXAMPLE_WEEK)} — nicht erlaubt`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <label className="choice">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          <span className="grow">Aktiv</span>
        </label>

        <div className="sheet-actions">
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn" disabled={busy || !baseOk || lines.length === 0}
            onClick={async () => {
              setBusy(true);
              const ok = await upsertMenuSource({
                id: source?.id, label, baseUrl, pathPatterns: lines, enabled,
              });
              setBusy(false);
              if (ok) onClose();
            }}>Speichern</button>
        </div>
      </div>
    </Sheet>
  );
}
