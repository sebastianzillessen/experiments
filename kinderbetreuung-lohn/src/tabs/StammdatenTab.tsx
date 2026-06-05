import { useApp } from '../context/AppContext';

export function StammdatenTab() {
  const { activeTab, data, updateHouseholdName, updateEmployer } = useApp();
  const er = data.employer;

  return (
    <section id="stammdaten" role="tabpanel" aria-labelledby="tab-stammdaten" tabIndex={0}
      className={activeTab === 'stammdaten' ? 'active' : undefined}>
      <h2>Stammdaten</h2>
      <div className="section-sub">Diese Daten erscheinen auf jeder Lohnabrechnung.</div>

      <div className="card">
        <h3>Haushalt</h3>
        <div className="grid-2">
          <div>
            <label htmlFor="hh-name">Name des Haushalts</label>
            <input type="text" id="hh-name" placeholder="z.B. Familie Muster"
              value={data.householdName} onChange={e => updateHouseholdName(e.target.value)} />
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Dieser Name erscheint in Einladungs-E-Mails an weitere Personen.</p>
      </div>

      <div className="card">
        <h3>Arbeitgeber/in (Privathaushalt)</h3>
        <div className="grid-2">
          <div>
            <label htmlFor="ag-name">Name</label>
            <input type="text" id="ag-name" placeholder="Max Muster"
              value={er.name} onChange={e => updateEmployer({ name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ag-adresse">Strasse &amp; Nr.</label>
            <input type="text" id="ag-adresse" placeholder="Bahnhofstrasse 1"
              value={er.address} onChange={e => updateEmployer({ address: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ag-plz">PLZ</label>
            <input type="text" id="ag-plz" placeholder="8001" inputMode="numeric"
              value={er.zip} onChange={e => updateEmployer({ zip: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ag-ort">Ort</label>
            <input type="text" id="ag-ort" placeholder="Zürich"
              value={er.city} onChange={e => updateEmployer({ city: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ag-abrechnungsnr">SVA Abrechnungs-Nr. (optional)</label>
            <input type="text" id="ag-abrechnungsnr" placeholder="von SVA Zürich nach Anmeldung"
              value={er.billingNumber} onChange={e => updateEmployer({ billingNumber: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="info">Die Stammdaten und der Stundenlohn der einzelnen Mitarbeitenden werden im Bereich <strong>Mitarbeitende</strong> verwaltet.</div>
    </section>
  );
}
