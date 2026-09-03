// Encrypts the calendar address and login (user, password).
//
// RLS keeps clients out of fp_calendar_secrets, but it does not help against
// a database dump or a leaked service-role key. So the key lives in the Edge
// Function secret CALENDAR_ENCRYPTION_KEY, not in the database. A dump alone
// is then worth nothing.
//
// Format is JWE compact (dir + A256GCM) from `jose`. It carries algorithm,
// IV and auth tag itself, so we write no crypto and no format of our own.
//
// No Deno-only APIs, so the vitest suite checks the very same code.

import { CompactEncrypt, compactDecrypt, decodeProtectedHeader } from 'jose';

const ALG = 'dir';
const ENC = 'A256GCM';

/** True for a value we wrote, false for plaintext from before encryption. */
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

export async function encryptSecret(plain: string, keyB64: string): Promise<string> {
  const key = importKey(keyB64);
  return new CompactEncrypt(new TextEncoder().encode(plain))
    .setProtectedHeader({ alg: ALG, enc: ENC })
    .encrypt(key);
}

/**
 * Two concessions to migration: `null` stays `null`, and anything that is not
 * a JWE is handed back as is. Those are rows from before encryption, which the
 * sync writes back encrypted on its next run.
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
    if (e instanceof Error && /base64|32 Bytes/.test(e.message)) throw e;
    throw new Error('Zugangsdaten konnten nicht entschlüsselt werden');
  }
}
