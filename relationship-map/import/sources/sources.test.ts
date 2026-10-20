import Database from "better-sqlite3";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readContacts } from "./contacts.ts";
import { readImessageEvents } from "./imessage.ts";
import { readMailEvents } from "./mail.ts";
import { readWhatsappEvents, readWhatsappNames } from "./whatsapp.ts";

function tmpDb(name: string): string {
  return join(mkdtempSync(join(tmpdir(), "relmap-test-")), name);
}

test("imessage reader converts ns-since-2001 dates and direction", () => {
  const path = tmpDb("chat.db");
  const db = new Database(path);
  db.exec(`CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
           CREATE TABLE message (ROWID INTEGER PRIMARY KEY, handle_id INTEGER, date INTEGER, is_from_me INTEGER);`);
  db.prepare("INSERT INTO handle (ROWID, id) VALUES (1, ?)").run("+41791112233");
  db.prepare("INSERT INTO handle (ROWID, id) VALUES (2, '')").run(); // skipped
  // 2024-01-01T00:00:00Z = 1704067200 unix => apple ns = (1704067200-978307200)*1e9
  const appleNs = (1704067200 - 978307200) * 1e9;
  db.prepare("INSERT INTO message (handle_id, date, is_from_me) VALUES (1, ?, 1)").run(appleNs);
  db.prepare("INSERT INTO message (handle_id, date, is_from_me) VALUES (2, ?, 0)").run(appleNs);
  db.close();

  const events = readImessageEvents(path);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.handle, "+41791112233");
  assert.equal(events[0]!.outgoing, true);
  assert.equal(new Date(events[0]!.tsMs).toISOString(), "2024-01-01T00:00:00.000Z");
});

test("whatsapp reader keeps 1:1 only and parses offset timestamps", () => {
  const path = tmpDb("messages.db");
  const db = new Database(path);
  db.exec(`CREATE TABLE messages (chat_jid TEXT, timestamp TEXT, is_from_me INTEGER);
           CREATE TABLE chats (jid TEXT, name TEXT);`);
  db.prepare("INSERT INTO messages VALUES ('41791112233@s.whatsapp.net', '2026-06-19 22:50:10+02:00', 0)").run();
  db.prepare("INSERT INTO messages VALUES ('123-456@g.us', '2026-06-19 22:50:10+02:00', 0)").run(); // group, skipped
  db.prepare("INSERT INTO chats VALUES ('41791112233@s.whatsapp.net', 'Alice')").run();
  db.close();

  const events = readWhatsappEvents(path);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.handle, "41791112233");
  assert.equal(new Date(events[0]!.tsMs).toISOString(), "2026-06-19T20:50:10.000Z");
  assert.equal(readWhatsappNames(path).get("41791112233"), "Alice");
});

test("mail reader emits sender + recipient events in unix seconds", () => {
  const path = tmpDb("Envelope Index");
  const db = new Database(path);
  db.exec(`CREATE TABLE addresses (ROWID INTEGER PRIMARY KEY, address TEXT);
           CREATE TABLE messages (ROWID INTEGER PRIMARY KEY, sender INTEGER, date_sent INTEGER);
           CREATE TABLE recipients (ROWID INTEGER PRIMARY KEY, message INTEGER, address INTEGER, type INTEGER);`);
  db.prepare("INSERT INTO addresses VALUES (1, 'her@x.com'), (2, 'me@x.com')").run();
  db.prepare("INSERT INTO messages VALUES (10, 1, 1700000000)").run(); // her -> me
  db.prepare("INSERT INTO recipients VALUES (100, 10, 2, 0)").run();
  db.close();

  const events = readMailEvents(path);
  assert.equal(events.length, 2);
  const sender = events.find((e) => e.handle === "her@x.com")!;
  assert.equal(sender.outgoing, false);
  assert.equal(sender.tsMs, 1700000000 * 1000);
  assert.equal(events.find((e) => e.handle === "me@x.com")!.outgoing, true);
});

test("contacts reader joins phones/emails and falls back to org/nick for name", () => {
  const dir = mkdtempSync(join(tmpdir(), "relmap-ab-"));
  const path = join(dir, "AddressBook-v22.abcddb");
  const db = new Database(path);
  db.exec(`CREATE TABLE ZABCDRECORD (Z_PK INTEGER PRIMARY KEY, ZFIRSTNAME TEXT, ZLASTNAME TEXT, ZORGANIZATION TEXT, ZNICKNAME TEXT, ZCONTAINERWHERECONTACTISME INTEGER);
           CREATE TABLE ZABCDPHONENUMBER (Z_PK INTEGER PRIMARY KEY, ZOWNER INTEGER, ZFULLNUMBER TEXT);
           CREATE TABLE ZABCDEMAILADDRESS (Z_PK INTEGER PRIMARY KEY, ZOWNER INTEGER, ZADDRESS TEXT);`);
  db.prepare("INSERT INTO ZABCDRECORD VALUES (1, 'Alice', 'Smith', NULL, NULL, NULL)").run();
  db.prepare("INSERT INTO ZABCDRECORD VALUES (2, NULL, NULL, 'Acme Corp', NULL, NULL)").run();
  db.prepare("INSERT INTO ZABCDRECORD VALUES (3, 'My', 'Self', NULL, NULL, 1)").run();
  db.prepare("INSERT INTO ZABCDPHONENUMBER VALUES (1, 1, '+41 79 111 2233')").run();
  db.prepare("INSERT INTO ZABCDEMAILADDRESS VALUES (1, 1, 'Alice@X.com')").run();
  db.close();

  const contacts = readContacts(dir);
  const alice = contacts.find((c) => c.displayName === "Alice Smith")!;
  assert.deepEqual(alice.phones, ["41791112233"]);
  assert.deepEqual(alice.emails, ["alice@x.com"]);
  assert.equal(alice.isMe, false);
  assert.ok(contacts.some((c) => c.displayName === "Acme Corp"));
  assert.equal(contacts.find((c) => c.displayName === "My Self")!.isMe, true);
});
