// Normalization + matching keys for handles. Phone matching is heuristic: we
// compare numbers by their last 9 significant digits, which makes the same
// person line up across WhatsApp (no "+", with country code), iMessage (E.164),
// and Contacts (any local/international format) without a full libphonenumber.

/** Strip a phone string to digits only; returns null if too short to be real. */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  // Drop the "00" international call prefix so it aligns with "+" forms.
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 6) return null;
  return digits;
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export function isEmail(handle: string): boolean {
  return handle.includes("@");
}

/** Last 9 digits — the national-significant tail used to match phones. */
function phoneSuffix(digits: string): string {
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/**
 * A stable key used to match a handle across sources and against contacts.
 * Emails: "e:<address>". Phones: "p:<last9digits>". Null if unparseable.
 */
export function matchKey(handle: string): string | null {
  if (isEmail(handle)) {
    const email = normalizeEmail(handle);
    return email ? `e:${email}` : null;
  }
  const digits = normalizePhone(handle);
  return digits ? `p:${phoneSuffix(digits)}` : null;
}
