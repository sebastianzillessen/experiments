import { ensureCategory, upsertImportedPerson } from "../server/repo.ts";
import type { ContactFrequency } from "../server/types.ts";
import {
  HALF_LIFE_DAYS,
  MIN_UNKNOWN_EVENTS,
  PLACE_LIMIT,
  SELF_HANDLES,
  SOURCES,
} from "./config.ts";
import { matchKey } from "./normalize.ts";
import { resolve } from "./resolve.ts";
import { scorePeople } from "./score.ts";
import { readContacts } from "./sources/contacts.ts";
import { readImessageEvents } from "./sources/imessage.ts";
import { readMailEvents } from "./sources/mail.ts";
import { readWhatsappEvents, readWhatsappNames } from "./sources/whatsapp.ts";
import type { InteractionEvent } from "./types.ts";

export interface ImportSummary {
  contactsImported: number;
  placed: number;
  updated: number;
  archivedHidden: number;
  unmatchedHandles: number;
}

const MS_PER_DAY = 86_400_000;
/**
 * Imported people start in a dedicated "Uncategorised" bucket. The map spreads
 * these around the full circle (not one wedge); dragging a node into a category
 * wedge reassigns it. Kept separate from the seed "Other" category.
 */
const UNCATEGORISED = { name: "Uncategorised", color: "#94a3b8" };

const isKnownContact = (externalKey: string) => externalKey.startsWith("contact:");

/** Map recent cadence (last 90 days) to the app's contact-frequency buckets. */
function frequencyBucket(events: InteractionEvent[], nowMs: number): ContactFrequency {
  const recent = events.filter((e) => nowMs - e.tsMs <= 90 * MS_PER_DAY);
  if (recent.length === 0) return "rarely";
  const perWeek = recent.length / (90 / 7);
  if (perWeek >= 5) return "daily";
  if (perWeek >= 1) return "weekly";
  if (perWeek >= 0.25) return "monthly";
  return "rarely";
}

/** Read all local sources, score interactions, and write people into the DB. */
export function runImport(nowMs = Date.now()): ImportSummary {
  const contacts = readContacts(SOURCES.contactsDir);
  const events: InteractionEvent[] = [
    ...readWhatsappEvents(SOURCES.whatsappDb),
    ...readImessageEvents(SOURCES.imessageDb),
    ...readMailEvents(SOURCES.mailIndex),
  ];
  const whatsappNames = readWhatsappNames(SOURCES.whatsappDb);

  // Self-exclusion: the "me" card, plus any duplicate contacts that share the
  // me-card's name (self is often also a normal synced contact), plus env
  // overrides. All their handles become self handles so messaging/mail to your
  // own number/address don't create or inflate a person.
  const meNames = new Set(
    contacts.filter((c) => c.isMe).map((c) => c.displayName.toLowerCase()),
  );
  const isSelf = (c: { isMe: boolean; displayName: string }) =>
    c.isMe || meNames.has(c.displayName.toLowerCase());
  const selfHandleStrings = [
    ...SELF_HANDLES,
    ...contacts.filter(isSelf).flatMap((c) => [...c.phones, ...c.emails]),
  ];
  const selfKeys = new Set(
    selfHandleStrings.map(matchKey).filter((k): k is string => k !== null),
  );
  const realContacts = contacts.filter((c) => !isSelf(c));

  const resolved = resolve(realContacts, events, whatsappNames, selfKeys);
  const freqByKey = new Map(
    resolved.people.map((p) => [p.external_key, frequencyBucket(p.events, nowMs)]),
  );

  // Drop trivial unknown handles (2FA/bots/one-offs); keep all known contacts.
  const significant = resolved.people.filter(
    (p) => isKnownContact(p.external_key) || p.events.length >= MIN_UNKNOWN_EVENTS,
  );

  const opts = { halfLifeDays: HALF_LIFE_DAYS, nowMs };
  // Rank by raw recency-weighted score (calibration-independent) to pick who's
  // placed, then re-score the placed cohort alone so their ratings spread across
  // the full 1–10 range instead of all bunching at the top of the population.
  const ranked = scorePeople(significant, opts)
    .filter((s) => s.history.length > 0)
    .sort((a, b) => b.score - a.score);
  const placeKeys = new Set(ranked.slice(0, PLACE_LIMIT).map((s) => s.external_key));
  const placedPeople = significant.filter((p) => placeKeys.has(p.external_key));
  const placedByKey = new Map(scorePeople(placedPeople, opts).map((s) => [s.external_key, s]));

  const categoryId = ensureCategory(UNCATEGORISED.name, UNCATEGORISED.color);
  let placed = 0;
  let updated = 0;
  let archivedHidden = 0;

  for (const s of ranked) {
    const archived = !placeKeys.has(s.external_key);
    const { created } = upsertImportedPerson({
      external_key: s.external_key,
      name: s.name || "(unknown)",
      category_id: categoryId,
      contact_frequency: freqByKey.get(s.external_key) ?? "rarely",
      // Placed people use the cohort-calibrated history (spread); archived keep
      // the population-calibrated one (they're hidden anyway).
      history: (archived ? s : placedByKey.get(s.external_key) ?? s).history,
      archived,
    });
    if (archived) archivedHidden += created ? 1 : 0;
    else created ? placed++ : updated++;
  }

  // Contacts with no interaction at all → imported but archived.
  for (const c of resolved.archivedContacts) {
    const { created } = upsertImportedPerson({
      external_key: c.external_key,
      name: c.name || "(unknown)",
      category_id: categoryId,
      contact_frequency: "never",
      history: [],
      archived: true,
    });
    if (created) archivedHidden++;
  }

  return {
    contactsImported: contacts.length,
    placed,
    updated,
    archivedHidden,
    unmatchedHandles: resolved.unmatchedHandles,
  };
}
