import { matchKey } from "./normalize.ts";
import type { InteractionEvent, RawContact, ResolvedPerson } from "./types.ts";

export interface ResolveResult {
  /** People with at least one interaction — placed on the map. */
  people: ResolvedPerson[];
  /** Contacts with no interaction — imported but archived/hidden. */
  archivedContacts: Array<{ external_key: string; name: string }>;
  /** Channel handles that matched neither a contact nor any other channel. */
  unmatchedHandles: number;
}

const contactKeyToExternal = (contactKey: string) => `contact:${contactKey}`;
const handleKeyToExternal = (matchedKey: string) => `handle:${matchedKey}`;

/**
 * Merge address-book contacts with channel interactions into people keyed by a
 * stable external_key. A handle that matches a contact's phone/email joins that
 * contact; an unmatched WhatsApp/iMessage handle becomes its own person. Mail
 * never creates a person on its own — it only augments someone already known
 * from a contact or another channel (keeps newsletters out).
 */
export function resolve(
  contacts: RawContact[],
  events: InteractionEvent[],
  whatsappNames: Map<string, string>,
  selfKeys: Set<string>,
): ResolveResult {
  // Index contacts by every matchKey of their phones/emails.
  const keyToContact = new Map<string, RawContact>();
  for (const c of contacts) {
    for (const handle of [...c.phones, ...c.emails]) {
      const key = matchKey(handle);
      if (key && !keyToContact.has(key)) keyToContact.set(key, c);
    }
  }

  const persons = new Map<string, ResolvedPerson>();
  const knownHandleKeys = new Set<string>();
  let unmatchedHandles = 0;

  const add = (external_key: string, name: string, event: InteractionEvent) => {
    const existing = persons.get(external_key);
    if (existing) existing.events.push(event);
    else persons.set(external_key, { external_key, name, events: [event] });
  };

  // Pass 1: messaging channels establish who exists.
  for (const event of events) {
    if (event.channel === "mail") continue;
    const key = matchKey(event.handle);
    if (!key || selfKeys.has(key)) continue;
    const contact = keyToContact.get(key);
    if (contact) {
      add(contactKeyToExternal(contact.contactKey), contact.displayName, event);
    } else {
      knownHandleKeys.add(key);
      const name = whatsappNames.get(event.handle) ?? event.handle;
      add(handleKeyToExternal(key), name, event);
    }
  }

  // Pass 2: mail augments only people already known.
  for (const event of events) {
    if (event.channel !== "mail") continue;
    const key = matchKey(event.handle);
    if (!key || selfKeys.has(key)) continue;
    const contact = keyToContact.get(key);
    if (contact) {
      add(contactKeyToExternal(contact.contactKey), contact.displayName, event);
    } else if (knownHandleKeys.has(key)) {
      add(handleKeyToExternal(key), whatsappNames.get(event.handle) ?? event.handle, event);
    } else {
      unmatchedHandles++;
    }
  }

  // Contacts with no interaction → archived.
  const placedContactKeys = new Set(
    [...persons.keys()].filter((k) => k.startsWith("contact:")),
  );
  const archivedContacts = contacts
    .filter((c) => !placedContactKeys.has(contactKeyToExternal(c.contactKey)))
    .map((c) => ({ external_key: contactKeyToExternal(c.contactKey), name: c.displayName }));

  return { people: [...persons.values()], archivedContacts, unmatchedHandles };
}
