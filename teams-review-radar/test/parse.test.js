import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMessages, extractMessages, htmlToText } from '../src/parse.js';

const msg = (over = {}) => ({
  id: '1',
  messageType: 'message',
  createdDateTime: '2026-08-01T10:00:00Z',
  from: { user: { displayName: 'Ada', userIdentityType: 'aadUser' } },
  body: { contentType: 'html', content: '<p>hello</p>' },
  reactions: [],
  ...over,
});

test('htmlToText turns block tags into newlines and decodes entities', () => {
  assert.equal(htmlToText('<p>one</p><p>two &amp; three</p>'), 'one\ntwo & three');
  assert.equal(htmlToText('a<br>b'), 'a\nb');
  assert.equal(htmlToText('&#128064; eyes'), '👀 eyes');
  assert.equal(htmlToText('raw text', 'text'), 'raw text');
  assert.equal(htmlToText(''), '');
});

test('htmlToText keeps link text but drops markup', () => {
  const html = 'see <a href="https://github.com/o/r/pull/1">PR #1</a> please';
  assert.equal(htmlToText(html), 'see PR #1 please');
});

test('extractMessages accepts a Graph page, a bare array, and an array of pages', () => {
  assert.equal(extractMessages({ value: [msg()] }).length, 1);
  assert.equal(extractMessages([msg()]).length, 1);
  assert.equal(extractMessages([{ value: [msg()] }, { value: [msg({ id: '2' })] }]).length, 2);
});

test('extractMessages throws on a Graph error envelope rather than reporting zero messages', () => {
  assert.throws(
    () => extractMessages({ error: { code: 'Forbidden', message: 'no access' } }),
    /Forbidden/,
  );
  assert.throws(() => extractMessages({ unexpected: true }), /Unrecognized input shape/);
});

test('parseMessages drops system events and deleted tombstones', () => {
  const items = parseMessages({
    value: [
      msg({ id: 'keep' }),
      msg({ id: 'system', messageType: 'systemEventMessage', from: null }),
      msg({ id: 'gone', deletedDateTime: '2026-08-02T10:00:00Z' }),
    ],
  });
  assert.deepEqual(items.map((i) => i.id), ['keep']);
});

test('parseMessages summarises replies and finds the latest one regardless of order', () => {
  const [item] = parseMessages({
    value: [
      msg({
        replies: [
          { id: 'r2', messageType: 'message', createdDateTime: '2026-08-03T09:00:00Z', from: { user: { displayName: 'Bo' } }, body: { contentType: 'text', content: 'later' } },
          { id: 'r1', messageType: 'message', createdDateTime: '2026-08-02T09:00:00Z', from: { user: { displayName: 'Cy' } }, body: { contentType: 'text', content: 'earlier' } },
        ],
      }),
    ],
  });
  assert.equal(item.replyCount, 2);
  assert.equal(item.lastReplyAt, '2026-08-03T09:00:00Z');
  assert.equal(item.lastReplyAuthor, 'Bo');
});

test('parseMessages reads the nested reaction identity', () => {
  const [item] = parseMessages({
    value: [
      msg({
        reactions: [
          { reactionType: '✅', createdDateTime: '2026-08-02T10:00:00Z', user: { user: { displayName: 'Grace' } } },
        ],
      }),
    ],
  });
  assert.deepEqual(item.reactions[0], {
    type: '✅',
    displayName: null,
    user: 'Grace',
    createdDateTime: '2026-08-02T10:00:00Z',
  });
});

test('parseMessages sorts newest first', () => {
  const items = parseMessages({
    value: [
      msg({ id: 'old', createdDateTime: '2026-08-01T10:00:00Z' }),
      msg({ id: 'new', createdDateTime: '2026-08-05T10:00:00Z' }),
    ],
  });
  assert.deepEqual(items.map((i) => i.id), ['new', 'old']);
});
