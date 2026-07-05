import type { Person, QuantityUnit } from "../types";
import { personInitials } from "../data/derive";

export interface OmniParsed {
  /** Reiner Item-Name (ohne @Person- und Mengen-Token). */
  name: string;
  /** Aufgelöste Person, oder undefined = Gemeinsam / nicht angegeben. */
  personId?: string;
  personLabel?: string;
  /** Roh eingegebene Menge (null = keine angegeben). */
  qty: number | null;
  baseQty: number;
  unit: QuantityUnit;
  totalQty: number;
}

/**
 * Parst die Omnibox-Eingabe nach folgender Grammatik (Reihenfolge egal):
 *   - reine Zahl        → Menge         (z.B. "3")
 *   - @xx               → Person        (Initialen oder Namens-Präfix, z.B. "@Li")
 *   - restlicher Text   → Item-Name / Beschreibung
 *
 * Kommas werden wie Leerzeichen behandelt, damit die alte "Name, 5"-Syntax
 * weiter funktioniert.
 */
export function parseOmni(
  raw: string,
  persons: Person[],
  durationDays: number,
): OmniParsed {
  const tokens = raw.replace(/,/g, " ").trim().split(/\s+/).filter(Boolean);

  let qty: number | null = null;
  let personId: string | undefined;
  let personLabel: string | undefined;
  const nameParts: string[] = [];

  for (const tok of tokens) {
    if (tok.startsWith("@") && tok.length > 1) {
      const key = tok.slice(1).toLowerCase();
      const byInitials = persons.find((p) => personInitials(p).toLowerCase() === key);
      const byPrefix = persons.find((p) => p.name.toLowerCase().startsWith(key));
      const match = byInitials ?? byPrefix;
      if (match) {
        personId = match.id;
        personLabel = match.name;
      }
      // @-Token wird nie Teil des Namens (auch wenn es keine Person trifft).
      continue;
    }
    if (/^\d+$/.test(tok)) {
      qty = Math.max(1, parseInt(tok, 10));
      continue;
    }
    nameParts.push(tok);
  }

  const name = nameParts.join(" ");

  let baseQty: number;
  let unit: QuantityUnit;
  if (qty == null) {
    baseQty = 1;
    unit = "per_trip";
  } else if (qty > 1 && durationDays > 1 && qty % durationDays === 0) {
    // Menge = Vielfaches der Tage → als "pro Tag" interpretieren.
    baseQty = qty / durationDays;
    unit = "per_day";
  } else {
    baseQty = qty;
    unit = "per_trip";
  }
  const totalQty = unit === "per_day" ? baseQty * durationDays : baseQty;

  return { name, personId, personLabel, qty, baseQty, unit, totalQty };
}
