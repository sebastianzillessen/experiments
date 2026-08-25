import test from 'node:test';
import assert from 'node:assert/strict';

import { classify, classifyItem, compileRules, normalizeEmoji, STATE } from '../src/classify.js';

const NOW = Date.parse('2026-08-25T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();

const item = (over = {}) => ({
  id: 'm1',
  webUrl: 'https://teams.microsoft.com/l/message/x/1',
  createdDateTime: hoursAgo(24),
  author: 'Ada',
  text: 'please review https://github.com/o/r/pull/1',
  rawHtml: 'please review <a href="https://github.com/o/r/pull/1">#1</a>',
  subject: null,
  reactions: [],
  replyCount: 0,
  lastReplyAt: null,
  lastReplyAuthor: null,
  ...over,
});

const react = (type, displayName = null, user = 'Bo') => ({
  type,
  displayName,
  user,
  createdDateTime: hoursAgo(2),
});

const state = (reactions) => classifyItem(item({ reactions }), compileRules({}), NOW).state;

test('normalizeEmoji strips variation selectors and skin tones', () => {
  assert.equal(normalizeEmoji('✔️'), '✔');
  assert.equal(normalizeEmoji('👍🏽'), '👍');
  assert.equal(normalizeEmoji(null), '');
});

test('no reactions means open', () => {
  assert.equal(state([]), STATE.OPEN);
});

test('eyes alone means in review', () => {
  assert.equal(state([react('👀')]), STATE.IN_REVIEW);
});

test('a checkmark wins even when eyes are also present', () => {
  assert.equal(state([react('👀'), react('✅')]), STATE.APPROVED);
  // Order must not matter.
  assert.equal(state([react('✅'), react('👀')]), STATE.APPROVED);
});

test('checkmark variants with a variation selector still count as approved', () => {
  assert.equal(state([react('✔️')]), STATE.APPROVED);
  assert.equal(state([react('☑️')]), STATE.APPROVED);
});

test('custom tenant emoji are matched on displayName', () => {
  assert.equal(state([react('custom', 'Approved')]), STATE.APPROVED);
  assert.equal(state([react('custom', 'reviewing')]), STATE.IN_REVIEW);
});

test('unrelated reactions leave a message open', () => {
  assert.equal(state([react('👍'), react('🎉'), react('custom', 'party-parrot')]), STATE.OPEN);
});

test('reviewers and approvers are reported with their names', () => {
  const result = classifyItem(
    item({ reactions: [react('👀', null, 'Marco'), react('👀', null, 'Lena')] }),
    compileRules({}),
    NOW,
  );
  assert.deepEqual(result.reviewers.map((r) => r.user), ['Marco', 'Lena']);
  assert.equal(result.approvers.length, 0);
});

test('age and idle time are measured from creation and last reply', () => {
  const result = classifyItem(
    item({ createdDateTime: hoursAgo(48), lastReplyAt: hoursAgo(3) }),
    compileRules({}),
    NOW,
  );
  assert.equal(result.ageMs, 48 * 3600000);
  assert.equal(result.idleMs, 3 * 3600000);
});

test('idle time falls back to creation when there are no replies', () => {
  const result = classifyItem(item({ createdDateTime: hoursAgo(10) }), compileRules({}), NOW);
  assert.equal(result.idleMs, 10 * 3600000);
});

test('PR detection matches github, azure devops and gitlab links', () => {
  const rules = compileRules({});
  const matches = (text) => classifyItem(item({ text, rawHtml: text }), rules, NOW).isPrRequest;
  assert.ok(matches('https://github.com/digitecgalaxus/checkout-api/pull/4821'));
  assert.ok(matches('https://dev.azure.com/dg/Platform/_git/shipping/pullrequest/9912'));
  assert.ok(matches('https://gitlab.com/dg/tools/-/merge_requests/58'));
  assert.ok(!matches('anyone up for lunch?'));
});

test('PR detection finds links hidden in href when the link text is a title', () => {
  const rules = compileRules({});
  const result = classifyItem(
    item({ text: 'Fix retry bug', rawHtml: '<a href="https://github.com/o/r/pull/9">Fix retry bug</a>' }),
    rules,
    NOW,
  );
  assert.ok(result.isPrRequest);
});

test('classify buckets, sorts oldest first and counts what it skipped', () => {
  const items = [
    item({ id: 'newOpen', createdDateTime: hoursAgo(2) }),
    item({ id: 'oldOpen', createdDateTime: hoursAgo(100) }),
    item({ id: 'watched', reactions: [react('👀')] }),
    item({ id: 'done', reactions: [react('✅')] }),
    item({ id: 'chatter', text: 'lunch?', rawHtml: 'lunch?' }),
  ];
  const result = classify(items, {}, { now: NOW });

  assert.deepEqual(result.open.map((i) => i.id), ['oldOpen', 'newOpen']);
  assert.deepEqual(result.inReview.map((i) => i.id), ['watched']);
  assert.equal(result.approvedCount, 1);
  assert.equal(result.skippedNonPr, 1);
  assert.equal(result.totalMessages, 5);
});

test('includeNonPr keeps chatter that matches no pattern', () => {
  const items = [item({ id: 'chatter', text: 'lunch?', rawHtml: 'lunch?' })];
  assert.equal(classify(items, {}, { now: NOW }).open.length, 0);
  assert.equal(classify(items, {}, { now: NOW, includeNonPr: true }).open.length, 1);
});

test('user config overrides defaults without wiping the other reaction list', () => {
  const config = { reactions: { approved: ['🟢'] } };
  const rules = compileRules(config);
  // The custom approved emoji works...
  assert.equal(classifyItem(item({ reactions: [react('🟢')] }), rules, NOW).state, STATE.APPROVED);
  // ...the default 👀 list survives...
  assert.equal(classifyItem(item({ reactions: [react('👀')] }), rules, NOW).state, STATE.IN_REVIEW);
  // ...and the replaced default no longer counts.
  assert.equal(classifyItem(item({ reactions: [react('✅')] }), rules, NOW).state, STATE.OPEN);
});

test('custom prPatterns replace the defaults', () => {
  const config = { prPatterns: ['REVIEW-\\d+'] };
  const rules = compileRules(config);
  assert.ok(classifyItem(item({ text: 'REVIEW-42 ready', rawHtml: '' }), rules, NOW).isPrRequest);
  assert.ok(!classifyItem(item({ text: 'https://github.com/o/r/pull/1', rawHtml: '' }), rules, NOW).isPrRequest);
});
