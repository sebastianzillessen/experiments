-- Kalender-Zugangsdaten werden ab jetzt verschlüsselt gespeichert.
--
-- Der Schlüssel liegt als Secret der Edge Function (CALENDAR_ENCRYPTION_KEY),
-- also ausserhalb der Datenbank. Damit nützt ein Datenbank-Dump — oder ein
-- abhandengekommener Service-Role-Key — allein niemandem mehr: in
-- fp_calendar_secrets stehen dann nur noch JWE-Container.
--
-- Verschlüsselt wird in `family-calendar-sync`, weil Postgres den Schlüssel
-- bewusst nicht kennt. Deshalb verschwindet fp_upsert_calendar hier: solange
-- es existiert, gäbe es einen Weg, Klartext in die Tabelle zu schreiben.
-- Das Anlegen und Ändern eines Kalenders läuft jetzt über die Funktion
-- (`{ action: 'save', … }`), die Rolle und Familie genauso prüft, wie es die
-- RPC getan hat.
--
-- Bestandszeilen bleiben unverändert lesbar: die Funktion erkennt Klartext und
-- schreibt ihn beim nächsten Abruf verschlüsselt zurück. Ein Migrationsskript
-- dafür kann es nicht geben — die Datenbank hat den Schlüssel nicht.

drop function if exists public.fp_upsert_calendar(uuid, text, text, text, text, text, boolean, uuid);

comment on table public.fp_calendar_secrets is
  'Kalender-Adresse und Zugangsdaten als JWE (dir + A256GCM). RLS ist aktiv '
  'und hat bewusst keine Policy: nur der Service-Role-Key der Edge Function '
  'liest hier, und ohne CALENDAR_ENCRYPTION_KEY sind die Werte auch dann '
  'nutzlos. Schreiben ausschliesslich über family-calendar-sync.';
