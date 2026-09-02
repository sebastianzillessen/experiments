// Turning a pasted calendar address into something safe to fetch.
//
// Pure and dependency-free so the vitest suite exercises the same code the
// Edge Function runs — this is the guard that stands between a user-supplied
// string and an outbound request made with the service role.

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i;
const PRIVATE_IPV4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * Normalise and vet a calendar URL.
 *
 * Apple/iCloud, Google and most calendar apps hand out `webcal://` links —
 * the same feed, a scheme name that tells the OS to open a calendar app. It is
 * rewritten to https **as a string, before parsing**: `webcal` is a
 * non-special scheme in the WHATWG URL standard, and the `protocol` setter
 * silently refuses to move a non-special URL to a special scheme like https,
 * so `new URL(raw).protocol = 'https:'` looks right and does nothing.
 *
 * Everything else is rejected: plain http (the feed URL is a secret and must
 * not travel in clear), other schemes, and hosts that point back into a
 * private network.
 *
 * @throws Error with a message safe to store in fp_calendars.last_error.
 */
export function normalizeCalendarUrl(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) throw new Error('Keine Kalender-Adresse hinterlegt');

  const rewritten = trimmed.replace(/^webcals?:\/\//i, 'https://');

  let url: URL;
  try {
    url = new URL(rewritten);
  } catch {
    throw new Error('Ungültige Kalender-URL');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Nur https- oder webcal-Kalender-URLs werden unterstützt');
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    PRIVATE_HOST.test(host)
    || PRIVATE_IPV4.test(host)
    || host === '::1'
    || host === '0.0.0.0'
    || /^f[cd][0-9a-f]{2}:/i.test(host)
    || /^fe80:/i.test(host)
  ) {
    throw new Error('Diese Adresse ist nicht erreichbar');
  }

  return url.toString();
}
