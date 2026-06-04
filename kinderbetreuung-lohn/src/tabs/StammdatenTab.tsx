import { useApp } from '../context/AppContext';

export function StammdatenTab() {
  const { activeTab, data, updateEmployer, updateEmployee } = useApp();
  const er = data.employer;
  const ee = data.employee;

  return (
    <section id="stammdaten" role="tabpanel" aria-labelledby="tab-stammdaten" tabIndex={0}
      className={activeTab === 'stammdaten' ? 'active' : undefined}>
      <h2>Stammdaten</h2>
      <div className="section-sub">Diese Daten erscheinen auf jeder Lohnabrechnung.</div>

      <div className="card">
        <h3>Arbeitgeber/in (Privathaushalt)</h3>
        <div className="grid-2">
          <div>
            <label htmlFor="ag-name">Name</label>
            <input type="text" id="ag-name" placeholder="Max Muster"
              value={er.name} onChange={e => updateEmployer({ name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ag-adresse">Adresse</label>
            <input type="text" id="ag-adresse" placeholder="Bahnhofstrasse 1, 8001 Zürich"
              value={er.address} onChange={e => updateEmployer({ address: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ag-abrechnungsnr">SVA Abrechnungs-Nr. (optional)</label>
            <input type="text" id="ag-abrechnungsnr" placeholder="von SVA Zürich nach Anmeldung"
              value={er.billingNumber} onChange={e => updateEmployer({ billingNumber: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Arbeitnehmer/in (Hilfe im Haushalt)</h3>
        <div className="grid-2">
          <div>
            <label htmlFor="an-name">Name</label>
            <input type="text" id="an-name" placeholder="Erika Beispiel"
              value={ee.name} onChange={e => updateEmployee({ name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="an-adresse">Adresse</label>
            <input type="text" id="an-adresse"
              value={ee.address} onChange={e => updateEmployee({ address: e.target.value })} />
          </div>
          <div>
            <label htmlFor="an-geburtsdatum">Geburtsdatum</label>
            <input type="date" id="an-geburtsdatum"
              value={ee.birthDate} onChange={e => updateEmployee({ birthDate: e.target.value })} />
          </div>
          <div>
            <label htmlFor="an-ahvnr">AHV-Nr. (756.xxxx.xxxx.xx)</label>
            <input type="text" id="an-ahvnr" placeholder="756.0000.0000.00"
              value={ee.ahvNumber} onChange={e => updateEmployee({ ahvNumber: e.target.value })} />
          </div>
          <div>
            <label htmlFor="an-iban">IBAN für Lohnzahlung</label>
            <input type="text" id="an-iban" placeholder="CH00 0000 0000 0000 0000 0"
              value={ee.iban} onChange={e => updateEmployee({ iban: e.target.value })} />
          </div>
        </div>
        <div className="checkbox-row">
          <input type="checkbox" id="an-8h"
            checked={ee.weeklyHoursThreshold8h}
            onChange={e => updateEmployee({ weeklyHoursThreshold8h: e.target.checked })} />
          <label htmlFor="an-8h">Arbeitet ≥ 8 Stunden pro Woche beim selben Arbeitgeber (Pflicht NBU-Versicherung)</label>
        </div>
      </div>
    </section>
  );
}
