import test from 'node:test';
import assert from 'node:assert/strict';

import { renderHtml, formatDuration } from '../src/render.js';
import { classify } from '../src/classify.js';

const NOW = Date.parse('2026-08-25T12:00:00Z');

const item = (over = {}) => ({
  id: 'm1',
  webUrl: 'https://teams.microsoft.com/l/message/x/1',
  createdDateTime: new Date(NOW - 3600000).toISOString(),
  author: 'Ada',
  text: 'review https://github.com/o/r/pull/1',
  rawHtml: 'review https://github.com/o/r/pull/1',
  subject: null,
  reactions: [],
  replyCount: 0,
  lastReplyAt: null,
  lastReplyAuthor: null,
  ...over,
});

const render = (items) => renderHtml(classify(items, {}, { now: NOW }), { dataAsOf: 'now' });

test('formatDuration picks a sensible unit', () => {
  assert.equal(formatDuration(3 * 86400000 + 4 * 3600000), '3d 4h');
  assert.equal(formatDuration(5 * 3600000 + 30 * 60000), '5h 30m');
  assert.equal(formatDuration(12 * 60000), '12m');
  assert.equal(formatDuration(null), 'unknown');
  assert.equal(formatDuration(-1000), 'just now');
});

test('message text is escaped, not injected as markup', () => {
  const html = render([
    item({
      text: '<script>alert(1)</script> review https://github.com/o/r/pull/1',
      author: '<img src=x onerror=alert(2)>',
    }),
  ]);
  // The payload may still appear as inert text; what must not happen is a tag forming.
  assert.ok(!html.includes('<script>alert(1)</script>'), 'script tag must not survive');
  assert.ok(!/<img\b/i.test(html), 'img tag must not survive');
  assert.ok(html.includes('&lt;script&gt;'), 'it should appear escaped instead');
  assert.ok(html.includes('&lt;img src=x onerror=alert(2)&gt;'), 'author renders as escaped text');
});

test('a hostile webUrl cannot break out of the href attribute', () => {
  const html = render([item({ webUrl: 'https://x/"><script>alert(3)</script>' })]);
  assert.ok(!html.includes('"><script>'), 'quote must be escaped');
  assert.ok(html.includes('&quot;&gt;&lt;script&gt;'));
});

test('the page reports counts and renders both sections', () => {
  const html = render([
    item({ id: 'a' }),
    item({ id: 'b', reactions: [{ type: '👀', displayName: null, user: 'Marco', createdDateTime: null }] }),
    item({ id: 'c', reactions: [{ type: '✅', displayName: null, user: 'Lena', createdDateTime: null }] }),
  ]);
  assert.ok(html.includes('<title>Teams Review Radar</title>'));
  assert.ok(html.includes('Unclaimed'));
  assert.ok(html.includes('In review'));
  assert.ok(html.includes('👀 Marco'), 'reviewer names should be listed');
});

test('empty state renders without any cards', () => {
  const html = render([]);
  assert.ok(html.includes('Nothing unclaimed'));
  assert.ok(html.includes('Nothing sitting in review'));
  assert.ok(!html.includes('<li class="card'));
});

test('the page is self-contained — no external requests', () => {
  const html = render([item()]);
  const externalRefs = html.match(/(?:src|href)\s*=\s*"https?:\/\/[^"]*/g) ?? [];
  // The only absolute URLs allowed are the Teams deep links the user clicks.
  for (const ref of externalRefs) {
    assert.ok(ref.includes('teams.microsoft.com'), `unexpected external reference: ${ref}`);
  }
  assert.ok(!/<(script|link)\b/i.test(html), 'no script or link tags');
});
