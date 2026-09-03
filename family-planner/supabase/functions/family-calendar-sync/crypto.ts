// Verschlüsselung der Kalender-Zugangsdaten (Adresse, Benutzer, Passwort).
//
// Warum überhaupt: RLS hält Clients von fp_calendar_secrets fern, aber gegen
// einen Datenbank-Dump oder einen abhandengekommenen Service-Role-Key hilft
// sie nicht — dort stünden die Werte im Klartext. Der Schlüssel liegt deshalb
// NICHT in der Datenbank, sondern als Secret der Edge Function
// (CALENDAR_ENCRYPTION_KEY). Ein Dump allein nützt damit niemandem.
//
// Gemacht wird das von `jose`: JWE compact (dir + A256GCM) — ein
// standardisiertes Containerformat, das Algorithmus, IV und Auth-Tag selbst
// mitbringt. Wir schreiben hier weder Primitiven noch ein eigenes Format.
//
// Frei von Deno-spezifischen APIs, damit die vitest-Suite exakt denselben Code
// prüft. Der Import ist ein blosser Paketname: Node nimmt ihn aus
// node_modules (package.json), Deno aus dem Import-Map in deno.json daneben.

import { CompactEncrypt, compactDecrypt, decodeProtectedHeader } from 'jose';

/** dir = der Schlüssel verschlüsselt direkt, ohne zweite Schlüsselschicht. */
const ALG = 'dir';
const ENC = 'A256GCM';

/**
 * Ist der Wert ein JWE — oder Klartext aus der Zeit vor der Verschlüsselung?
 * Ein JWE compact hat fünf Punkt-getrennte Teile und einen lesbaren Header.
 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (typeof value !== 'string' || value.split('.').length !== 5) return false;
  try {
    const header = decodeProtectedHeader(value);
    return header.alg === ALG && header.enc === ENC;
  } catch {
    return false;
  }
}

function importKey(keyB64: string): Uint8Array {
  let raw: Uint8Array;
  try {
    const binary = atob(keyB64.trim());
    raw = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) raw[i] = binary.charCodeAt(i);
  } catch {
    throw new Error('Verschlüsselungsschlüssel ist kein gültiges base64');
  }
  if (raw.length !== 32) {
    throw new Error('Verschlüsselungsschlüssel muss 32 Bytes lang sein (openssl rand -base64 32)');
  }
  return raw;
}

/** Klartext → JWE. Der IV kommt pro Aufruf frisch aus der Bibliothek. */
export async function encryptSecret(plain: string, keyB64: string): Promise<string> {
  const key = importKey(keyB64);
  return new CompactEncrypt(new TextEncoder().encode(plain))
    .setProtectedHeader({ alg: ALG, enc: ENC })
    .encrypt(key);
}

/**
 * Umkehrung — mit zwei bewussten Zugeständnissen an die Migration:
 * `null` bleibt `null`, und ein Wert, der kein JWE ist, wird unverändert
 * zurückgegeben (Bestand aus der Zeit vor der Verschlüsselung, den der Sync
 * beim nächsten Lauf verschlüsselt zurückschreibt).
 */
export async function decryptSecret(
  value: string | null | undefined, keyB64: string | null | undefined
): Promise<string | null> {
  if (value === null || value === undefined || value === '') return null;
  if (!isEncrypted(value)) return value;

  if (!keyB64) {
    throw new Error('Verschlüsselte Zugangsdaten, aber kein Schlüssel konfiguriert');
  }

  try {
    const { plaintext } = await compactDecrypt(value, importKey(keyB64));
    return new TextDecoder().decode(plaintext);
  } catch (e) {
    // Ein defekter Schlüssel soll als solcher gemeldet werden; alles andere
    // scheitert an der Authentifizierung von GCM — falscher Schlüssel und
    // manipulierter Ciphertext sind beide nicht zu entschlüsseln.
    if (e instanceof Error && /base64|32 Bytes/.test(e.message)) throw e;
    throw new Error('Zugangsdaten konnten nicht entschlüsselt werden');
  }
}
