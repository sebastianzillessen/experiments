import { useApp } from '../context/AppContext';
import { ausgleichskasseLabel, cantonName, cantonPreset } from '../lib/cantons';

// Static content copied verbatim from the vanilla index.html.
export function InfoTab() {
  const { activeTab, data } = useApp();
  const canton = data.employer.canton;
  const ak = ausgleichskasseLabel(canton);
  const preset = cantonPreset(canton);
  return (
    <section id="info" role="tabpanel" aria-labelledby="tab-info" tabIndex={0}
      className={activeTab === 'info' ? 'active' : undefined}>
      <h2>Info zum vereinfachten Abrechnungsverfahren</h2>
      <div className="section-sub">Kurzüberblick. Ersetzt keine Beratung durch die {ak} oder Treuhand.</div>

      <div className="card">
        <h3>Voraussetzungen vereinfachte Abrechnung (VAV / VAVplus)</h3>
        <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Bruttolohn pro Angestellte/r ≤ <strong>CHF 22'680/Jahr</strong> (= 2× max. AHV-Jahresrente).</li>
          <li>Total Lohnsumme aller Angestellten ≤ CHF 60'480/Jahr.</li>
          <li>Person ist nicht obligatorisch in der 2. Säule (BVG) versichert.</li>
          <li>Tätigkeiten im Privathaushalt (Betreuung, Reinigung, Garten usw.) gelten als Hausdienst → AHV-Beiträge sind <strong>immer</strong> abzurechnen, unabhängig von der Lohnhöhe.</li>
          <li>Anmeldung bei der zuständigen Ausgleichskasse{canton ? `: ${ak}` : ''} (Formular «Hausangestellte / Vereinfachte Abrechnung VAV oder VAVplus»).</li>
        </ul>
      </div>

      <div className="card">
        <h3>Beitragssätze 2026 (im Tool vorausgefüllt)</h3>
        <table>
          <thead>
            <tr><th>Beitrag</th><th className="num">Arbeitnehmer</th><th className="num">Arbeitgeber</th></tr>
          </thead>
          <tbody>
            <tr><td>Ferienentschädigung (4 / 5 / 6 Ferienwochen)</td><td className="num" colSpan={2}>8.33 % / 10.63 % / 13.04 % auf Bruttostunden</td></tr>
            <tr><td>Feiertagsentschädigung (kantonal, Richtwert{preset ? `, ${cantonName(canton)}` : ''})</td><td className="num" colSpan={2}>{preset ? preset.holidayPercent : 3.59} % auf Bruttostunden</td></tr>
            <tr><td>AHV / IV / EO</td><td className="num">5.30 %</td><td className="num">5.30 %</td></tr>
            <tr><td>ALV (Arbeitslosenversicherung)</td><td className="num">1.10 %</td><td className="num">1.10 %</td></tr>
            <tr><td>FAK Familienausgleichskasse (kantonal, Richtwert)</td><td className="num">–</td><td className="num">{preset ? preset.fakEmployer : 1.025} %</td></tr>
            <tr><td>Verwaltungskosten Ausgleichskasse</td><td className="num">–</td><td className="num">5.0 % der AHV/IV/EO-Beiträge</td></tr>
            <tr><td>Quellensteuer (für alle Nationalitäten)</td><td className="num">5.00 %</td><td className="num">–</td></tr>
            <tr><td>UVG-BU (VAVplus, optional)</td><td className="num">–</td><td className="num">0.505 %</td></tr>
            <tr><td>UVG-NBU (ab 8 h/Woche)</td><td className="num">1.432 %</td><td className="num">–</td></tr>
          </tbody>
        </table>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>AHV/IV/EO, ALV und Quellensteuer (5 %) sind eidgenössisch einheitlich. FAK und Feiertagszulage sind kantonale Richtwerte – bitte mit der zuständigen Ausgleichskasse prüfen. Quellen: SVA Zürich Online-Rechner «Beiträge von Haushaltshilfen berechnen — Löhne ab Januar 2026», AHV-IV Merkblätter 2.06 / 2.07 (Stand 1.1.2026).</div>
      </div>

      <div className="card">
        <h3>Ablauf</h3>
        <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Bei der zuständigen Ausgleichskasse{canton ? ` (${ak})` : ''} anmelden (VAV oder VAVplus).</li>
          <li>UVG-Versicherung abschliessen, falls VAVplus nicht gewählt (Suva nicht zuständig für Privathaushalte).</li>
          <li>Pro Einsatz: Stunden in diesem Tool erfassen.</li>
          <li>Pro Monat: Lohnabrechnung drucken, Nettolohn an Arbeitnehmer/in auszahlen.</li>
          <li>Jahresende: Lohndeklaration (Bruttosumme) an die {ak} übermitteln (Frist üblicherweise Ende Januar).</li>
          <li>SVA stellt Rechnung über Sozialversicherungsbeiträge + Quellensteuer (+ UVG bei VAVplus).</li>
        </ol>
      </div>

      <div className="warn">
        <strong>Wichtige Schwelle:</strong> Sobald der Bruttolohn CHF 22'680/Jahr überschreitet, ist die vereinfachte Abrechnung nicht mehr möglich — dann gilt die ordentliche Abrechnung mit Quellensteuer-Tarif gemäss Aufenthaltsstatus. Das Tool warnt automatisch ab 90 % der Schwelle.
      </div>
    </section>
  );
}
