import { describe, expect, it } from 'vitest';
import {
  decryptSecret, encryptSecret, isEncrypted,
} from '../supabase/functions/family-calendar-sync/crypto.ts';

/** 32 random bytes, the way `openssl rand -base64 32` gives them. */
function makeKey(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...raw));
}

const KEY = makeKey();
const OTHER_KEY = makeKey();
const URL = 'https://p103-caldav.icloud.com/published/2/AbC-xQ-dEf_8o';

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a calendar address', async () => {
    const sealed = await encryptSecret(URL, KEY);
    expect(sealed).not.toContain('icloud');
    expect(await decryptSecret(sealed, KEY)).toBe(URL);
  });

  it('round-trips umlauts and long passwords', async () => {
    const secret = 'Schlüssel-über-alles-🔐-' + 'x'.repeat(400);
    expect(await decryptSecret(await encryptSecret(secret, KEY), KEY)).toBe(secret);
  });

  it('never produces the same ciphertext twice', async () => {
    // A fresh IV per call — otherwise two calendars sharing an address would
    // be visibly identical in the table.
    const a = await encryptSecret(URL, KEY);
    const b = await encryptSecret(URL, KEY);
    expect(a).not.toBe(b);
    expect(await decryptSecret(a, KEY)).toBe(await decryptSecret(b, KEY));
  });

  it('marks its output as encrypted', async () => {
    const sealed = await encryptSecret(URL, KEY);
    expect(isEncrypted(sealed)).toBe(true);
    // JWE compact: header.encrypted_key.iv.ciphertext.tag
    expect(sealed.split('.')).toHaveLength(5);
    expect(JSON.parse(atob(sealed.split('.')[0]))).toEqual({ alg: 'dir', enc: 'A256GCM' });
  });

  it('refuses to decrypt with the wrong key', async () => {
    const sealed = await encryptSecret(URL, KEY);
    await expect(decryptSecret(sealed, OTHER_KEY)).rejects.toThrow(/nicht entschlüsselt/);
  });

  it('notices a tampered ciphertext', async () => {
    // AES-GCM authenticates: flipping a character must fail, not return junk.
    const parts = (await encryptSecret(URL, KEY)).split('.');
    const flipped = parts[3][0] === 'A' ? 'B' : 'A';
    parts[3] = flipped + parts[3].slice(1);
    await expect(decryptSecret(parts.join('.'), KEY)).rejects.toThrow(/nicht entschlüsselt/);
  });

  it('rejects a key of the wrong size', async () => {
    await expect(encryptSecret(URL, btoa('too short'))).rejects.toThrow(/32 Bytes/);
    await expect(encryptSecret(URL, 'nicht base64 !!')).rejects.toThrow(/base64|32 Bytes/);
  });
});

describe('migrating the values that are already stored', () => {
  it('passes a plaintext value through unchanged', async () => {
    // Rows written before this existed stay readable; the sync re-encrypts
    // them on its next run.
    expect(await decryptSecret(URL, KEY)).toBe(URL);
    expect(isEncrypted(URL)).toBe(false);
  });

  it('reads plaintext even with no key configured', async () => {
    expect(await decryptSecret(URL, null)).toBe(URL);
  });

  it('says so when an encrypted value meets a missing key', async () => {
    const sealed = await encryptSecret(URL, KEY);
    await expect(decryptSecret(sealed, null)).rejects.toThrow(/kein Schlüssel konfiguriert/);
  });

  it('treats an empty or absent value as absent', async () => {
    expect(await decryptSecret(null, KEY)).toBeNull();
    expect(await decryptSecret(undefined, KEY)).toBeNull();
    expect(await decryptSecret('', KEY)).toBeNull();
  });

  it('treats a malformed token as plaintext rather than guessing', async () => {
    // Not a readable JWE header → not something we wrote, so it is handed
    // back untouched instead of failing the whole sync.
    expect(await decryptSecret('a.b.c.d.e', KEY)).toBe('a.b.c.d.e');
  });
});
