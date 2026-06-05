// Swiss QR-bill (QR-Rechnung) for the net wage payout. Creditor = employee
// (IBAN holder), debtor = employer. Loaded lazily (separate chunk) so a load
// failure never breaks the app — mirrors the vanilla injectQrBill().

import { useEffect, useRef, useState } from 'react';
import type { Employer, EmployeeData } from './state';
import { fmtChf, monthLabel, round2 } from './format';

type QrState =
  | { kind: 'loading' }
  | { kind: 'note'; msg: string }
  | { kind: 'img'; src: string };

export type QrTracker = { pending: number };

async function buildQrDataUrl(ee: EmployeeData, er: Employer, yyyymm: string, netto: number): Promise<QrState> {
  if (!(netto > 0)) return { kind: 'note', msg: 'QR-Einzahlungsschein wird ab einem Nettolohn über CHF 0.00 erzeugt.' };
  const iban = ee.iban.replace(/\s+/g, '').toUpperCase();
  if (!/^(CH|LI)\d{2}[0-9A-Z]{17}$/.test(iban)) {
    return { kind: 'note', msg: 'QR-Einzahlungsschein nur mit einer Schweizer/Liechtensteiner IBAN (CH/LI) möglich.' };
  }
  if (!ee.zip || !ee.city || !ee.name) return { kind: 'note', msg: 'Für den QR-Einzahlungsschein bitte Name, PLZ und Ort der Arbeitnehmer/in in den Stammdaten ergänzen.' };
  if (!er.zip || !er.city || !er.name) return { kind: 'note', msg: 'Für den QR-Einzahlungsschein bitte Name, PLZ und Ort der Arbeitgeber/in in den Stammdaten ergänzen.' };

  try {
    const { SwissQRBill } = await import('swissqrbill/svg');
    const data = {
      currency: 'CHF' as const,
      amount: round2(netto),
      message: `Lohn ${monthLabel(yyyymm)}`,
      creditor: {
        account: iban,
        name: ee.name, address: ee.address || ee.city, zip: ee.zip, city: ee.city, country: ee.country || 'CH'
      },
      debtor: {
        name: er.name, address: er.address || er.city, zip: er.zip, city: er.city, country: er.country || 'CH'
      }
    };
    const bill = new SwissQRBill(data);
    // Render as a static <img> (SVG data URL) rather than a live inline SVG —
    // a single stable node prints reliably (no mid-print DOM mutation).
    const svgStr = new XMLSerializer().serializeToString(bill.element);
    return { kind: 'img', src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr) };
  } catch (e) {
    console.warn('QR-bill generation failed', e);
    return { kind: 'note', msg: 'QR-Einzahlungsschein konnte nicht erzeugt werden (IBAN/Adresse prüfen).' };
  }
}

export function QrBillSection({ ee, er, yyyymm, netto, slotId, tracker }: {
  ee: EmployeeData; er: Employer; yyyymm: string; netto: number; slotId: string; tracker: QrTracker;
}) {
  const [state, setState] = useState<QrState>({ kind: 'loading' });
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let cancelled = false;
    let released = false;
    tracker.pending++;
    const release = () => { if (!released) { released = true; tracker.pending--; } };
    setState({ kind: 'loading' });
    buildQrDataUrl(ee, er, yyyymm, netto)
      .then(async next => {
        if (cancelled) return;
        setState(next);
        // Wait until the image is actually decoded before counting down, so
        // printing doesn't reflow mid-preview (mirrors vanilla img.decode()).
        if (next.kind === 'img') {
          await new Promise<void>(r => setTimeout(r, 0));
          await imgRef.current?.decode?.().catch(() => {});
        }
      })
      .finally(release);
    return () => { cancelled = true; release(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ee, er, yyyymm, netto]);

  return (
    <div className="qr-bill-section">
      <h4>Zahlung Nettolohn — QR-Einzahlungsschein</h4>
      <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
        Im Banking-App scannen, um den Nettolohn von CHF {fmtChf(netto)} an {ee.name || 'die Arbeitnehmer/in'} zu überweisen.
      </div>
      <div id={slotId}>
        {state.kind === 'loading' && <div className="muted">QR-Einzahlungsschein wird geladen …</div>}
        {state.kind === 'note' && <div className="warn" style={{ margin: 0 }}>{state.msg}</div>}
        {state.kind === 'img' && <img ref={imgRef} alt="QR-Einzahlungsschein" src={state.src} />}
      </div>
    </div>
  );
}
