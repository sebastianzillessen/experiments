import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "./resolve.ts";
import { scorePeople } from "./score.ts";
import type { InteractionEvent, RawContact } from "./types.ts";

const ev = (
  channel: InteractionEvent["channel"],
  handle: string,
  tsMs: number,
): InteractionEvent => ({ channel, handle, tsMs, outgoing: false });

const contact = (key: string, name: string, phones: string[], emails: string[] = []): RawContact => ({
  contactKey: key,
  displayName: name,
  phones,
  emails,
  isMe: false,
});

test("resolve merges a contact reached via different channels/handles", () => {
  const contacts = [contact("c1", "Alice", ["41791112233"], ["alice@x.com"])];
  const events = [
    ev("whatsapp", "41791112233", 1000),
    ev("imessage", "+41 79 111 2233", 2000),
    ev("mail", "alice@x.com", 3000),
  ];
  const { people, archivedContacts } = resolve(contacts, events, new Map(), new Set());
  assert.equal(people.length, 1);
  assert.equal(people[0]!.external_key, "contact:c1");
  assert.equal(people[0]!.events.length, 3);
  assert.equal(archivedContacts.length, 0);
});

test("resolve keeps unknown messaging handles but drops unknown email-only", () => {
  const events = [
    ev("whatsapp", "49150000001", 1000), // unknown number -> handle person
    ev("mail", "newsletter@spam.com", 2000), // unknown email -> dropped
  ];
  const { people, unmatchedHandles } = resolve([], events, new Map([["49150000001", "Bob"]]), new Set());
  assert.equal(people.length, 1);
  assert.equal(people[0]!.name, "Bob");
  assert.equal(unmatchedHandles, 1);
});

test("resolve excludes self handles and archives contacts with no events", () => {
  const contacts = [
    contact("c1", "Alice", ["41791112233"]),
    contact("me", "Me", ["41790000000"]),
    contact("c2", "NeverTexted", ["41799999999"]),
  ];
  const events = [ev("whatsapp", "41791112233", 1000), ev("imessage", "41790000000", 1000)];
  const selfKeys = new Set(["p:790000000"]);
  const { people, archivedContacts } = resolve(contacts, events, new Map(), selfKeys);
  assert.deepEqual(people.map((p) => p.name), ["Alice"]);
  const archivedNames = archivedContacts.map((c) => c.name).sort();
  assert.deepEqual(archivedNames, ["Me", "NeverTexted"]);
});

test("scorePeople ranks recent+frequent above old+sparse", () => {
  const now = Date.UTC(2026, 5, 1);
  const month = 30 * 86_400_000;
  const close = {
    external_key: "contact:close",
    name: "Close",
    events: Array.from({ length: 20 }, (_, i) => ev("whatsapp", "1", now - i * 2 * 86_400_000)),
  };
  const distant = {
    external_key: "contact:distant",
    name: "Distant",
    events: [ev("whatsapp", "2", now - 24 * month)],
  };
  const scored = scorePeople([close, distant], { halfLifeDays: 180, nowMs: now });
  const closeRating = scored.find((s) => s.name === "Close")!.history.at(-1)!.rating;
  const distantRating = scored.find((s) => s.name === "Distant")!.history.at(-1)!.rating;
  assert.ok(closeRating > distantRating, `${closeRating} > ${distantRating}`);
  assert.equal(closeRating, 10);
});

test("scorePeople emits only changes, ascending, and never drops to 0 after first event", () => {
  const now = Date.UTC(2026, 5, 1);
  const p = {
    external_key: "contact:p",
    name: "P",
    events: [ev("whatsapp", "1", Date.UTC(2025, 0, 15))],
  };
  const [scored] = scorePeople([p], { halfLifeDays: 180, nowMs: now });
  assert.ok(scored!.history.length >= 1);
  assert.ok(scored!.history.every((h) => h.rating >= 1));
  const times = scored!.history.map((h) => h.changed_at);
  assert.deepEqual(times, [...times].sort());
});
