import assert from "node:assert/strict";
import { test } from "node:test";
import { isEmail, matchKey, normalizeEmail, normalizePhone } from "./normalize.ts";

test("normalizePhone strips formatting and drops 00 prefix", () => {
  assert.equal(normalizePhone("+41 76 269 7711"), "41762697711");
  assert.equal(normalizePhone("0041762697711"), "41762697711");
  assert.equal(normalizePhone("+447490206617"), "447490206617");
  assert.equal(normalizePhone("123"), null);
});

test("normalizeEmail lowercases and validates", () => {
  assert.equal(normalizeEmail("  Foo@Bar.COM "), "foo@bar.com");
  assert.equal(normalizeEmail("notanemail"), null);
});

test("isEmail distinguishes handles", () => {
  assert.equal(isEmail("a@b.com"), true);
  assert.equal(isEmail("+41791234567"), false);
});

test("matchKey lines up the same person across sources", () => {
  // Swiss mobile: WhatsApp jid, iMessage E.164, Contacts local form.
  const wa = matchKey("41762697711");
  const im = matchKey("+41762697711");
  const local = matchKey("076 269 7711");
  assert.equal(wa, "p:762697711");
  assert.equal(im, "p:762697711");
  assert.equal(local, "p:762697711");
});

test("matchKey for email", () => {
  assert.equal(matchKey("Lisa@Zillessen.info"), "e:lisa@zillessen.info");
});

test("matchKey returns null for junk", () => {
  assert.equal(matchKey("xx"), null);
});
