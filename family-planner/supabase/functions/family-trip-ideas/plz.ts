// A postal code is not a place you can reason about distances from.
//
// The family already keeps one field for where it lives — the code the weather
// is fetched for — and a second field for "where trips start" would be the
// same answer twice, maintained twice, drifting once. So the code is turned
// into a place here instead: openplzapi.org serves the Swiss post office's own
// directory, no key, no account.
//
// If the lookup fails the prompt falls back to naming the bare code, which is
// what it did before this existed. A missing travel estimate is a worse
// suggestion, not a broken one.

export type Locality = { name: string; canton: string };

// Short, because this waits in front of the model call: the directory answers
// in a fraction of a second or it is having a bad day, and the bare code will
// do either way.
const LOOKUP_TIMEOUT_MS = 2_500;

/**
 * The first locality of the answer. A code can cover several — 8134 comes
 * back three times for three communes, all of them Adliswil — and for naming
 * where a journey starts, the first is as good as the others.
 */
export function localityFrom(json: unknown): Locality | null {
  const first = Array.isArray(json) ? json[0] : null;
  if (!first || typeof first !== 'object') return null;
  const entry = first as { name?: unknown; canton?: { shortName?: unknown } };
  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  if (!name) return null;
  const canton = typeof entry.canton?.shortName === 'string' ? entry.canton.shortName.trim() : '';
  return { name: name.slice(0, 60), canton: canton.slice(0, 2) };
}

/** What the prompt calls the starting point. */
export function originLabel(plz: string | null, locality: Locality | null): string | null {
  if (locality) return locality.canton ? `${locality.name} ${locality.canton}` : locality.name;
  if (plz) return `der Schweizer Postleitzahl ${plz}`;
  return null;
}

export async function lookupPlz(
  plz: string, fetchImpl: typeof fetch = fetch
): Promise<Locality | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetchImpl(
      `https://openplzapi.org/ch/Localities?postalCode=${encodeURIComponent(plz)}`,
      { headers: { Accept: 'application/json' }, signal: controller.signal }
    );
    if (!res.ok) return null;
    return localityFrom(await res.json());
  } catch {
    // Down, slow, or answering something else: the code alone will do.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
