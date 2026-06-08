// In-app help assistant. A floating launcher opens a panel where a signed-in
// user can send a question; it is emailed to support in the background via the
// send-help-message Edge Function (reply-to = the user's address).
//
// Built so a future agent can answer inline: the function may return a `reply`
// string, which we render as the assistant's response instead of the plain
// "sent" confirmation.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { TABS, useApp } from '../context/AppContext';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; reply: string | null }
  | { kind: 'error'; text: string };

function tabLabel(id: string): string {
  return TABS.find(t => t.id === id)?.label ?? id;
}

export function HelpAssistant() {
  const { user, ui, role, data, activeTab } = useApp();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Only available to signed-in users inside the app (not on the login screen).
  const available = !!user && ui.strip;

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [open]);

  if (!available) return null;

  async function onSend() {
    const text = message.trim();
    if (!text) { setStatus({ kind: 'error', text: 'Bitte gib zuerst deine Frage ein.' }); return; }
    setStatus({ kind: 'sending' });
    try {
      const { data: resp, error } = await supabase.functions.invoke('send-help-message', {
        body: {
          message: text,
          context: {
            tab: tabLabel(activeTab),
            householdName: data.householdName || '',
            role: role || '',
            url: location.href
          }
        }
      });
      if (error) throw error;
      const reply = (resp && typeof resp === 'object' && 'reply' in resp)
        ? ((resp as { reply: string | null }).reply ?? null)
        : null;
      setStatus({ kind: 'sent', reply });
      setMessage('');
    } catch (e) {
      const m = (e as { message?: string })?.message || String(e);
      setStatus({ kind: 'error', text: 'Senden fehlgeschlagen: ' + m });
    }
  }

  function reset() {
    setStatus({ kind: 'idle' });
    setMessage('');
  }

  return (
    <div className="help-assistant no-print">
      {open && (
        <div className="help-panel" role="dialog" aria-label="Hilfe-Assistent">
          <div className="help-head">
            <h3>Hilfe &amp; Kontakt</h3>
            <button type="button" className="help-close" aria-label="Schließen"
              onClick={() => setOpen(false)}>✕</button>
          </div>

          {status.kind === 'sent' ? (
            <div className="help-body">
              {status.reply ? (
                <>
                  <div className="success" style={{ margin: '0 0 12px' }}>{status.reply}</div>
                  <p className="muted" style={{ fontSize: 12 }}>Hat das geholfen? Du kannst gerne noch eine Frage stellen.</p>
                </>
              ) : (
                <div className="success" style={{ margin: 0 }}>
                  Danke! Deine Nachricht wurde gesendet. Wir melden uns per E-Mail
                  an <strong>{user!.email}</strong>.
                </div>
              )}
              <div className="btn-row">
                <button type="button" className="btn btn-small" onClick={reset}>Neue Frage</button>
              </div>
            </div>
          ) : (
            <div className="help-body">
              <p className="help-intro">
                Stell deine Frage zu Salärli — wir helfen dir weiter und antworten
                per E-Mail an <strong>{user!.email}</strong>.
              </p>
              <textarea ref={textareaRef} id="help-message" rows={5}
                placeholder="z.B. Wie lege ich einen neuen Stundenlohn an?"
                value={message}
                disabled={status.kind === 'sending'}
                onChange={e => { setMessage(e.target.value); if (status.kind === 'error') setStatus({ kind: 'idle' }); }} />
              {status.kind === 'error' && (
                <div className="auth-error" style={{ marginTop: 8 }}>{status.text}</div>
              )}
              <div className="btn-row">
                <button type="button" className="btn" id="help-send"
                  disabled={status.kind === 'sending'} onClick={onSend}>
                  {status.kind === 'sending' ? 'Wird gesendet …' : 'Nachricht senden'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <button type="button" className="help-toggle" id="help-toggle"
        aria-expanded={open} aria-label="Hilfe öffnen"
        onClick={() => setOpen(o => !o)}>
        {open ? '✕' : '? Hilfe'}
      </button>
    </div>
  );
}
