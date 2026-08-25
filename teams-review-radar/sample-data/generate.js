/**
 * Regenerates messages.sample.json with timestamps relative to now, so the demo
 * dashboard always shows plausible ages. Run: node sample-data/generate.js
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const now = Date.now();
const ago = (hours) => new Date(now - hours * 3600000).toISOString();

const TEAM = 'fbe2bf47-16c8-47cf-b4a5-4b9b187c508b';
const CHANNEL = '19:4a95f7d8db4c4e7fae857bcebe0623e6@thread.tacv2';

let seq = 0;
const nextId = () => String(1716900000000 + (seq += 1));

function user(displayName, id) {
  return { application: null, device: null, user: { id, displayName, userIdentityType: 'aadUser' } };
}

function reaction(reactionType, displayName, name, id, hoursAgo) {
  return {
    reactionType,
    displayName,
    reactionContentUrl: null,
    createdDateTime: ago(hoursAgo),
    user: user(name, id),
  };
}

function message({ hoursAgo, author, authorId, html, reactions = [], replies = [], subject = null }) {
  const id = nextId();
  return {
    id,
    replyToId: null,
    etag: id,
    messageType: 'message',
    createdDateTime: ago(hoursAgo),
    lastModifiedDateTime: ago(hoursAgo),
    lastEditedDateTime: null,
    deletedDateTime: null,
    subject,
    summary: null,
    chatId: null,
    importance: 'normal',
    locale: 'en-us',
    webUrl: `https://teams.microsoft.com/l/message/${encodeURIComponent(CHANNEL)}/${id}?groupId=${TEAM}&parentMessageId=${id}`,
    policyViolation: null,
    eventDetail: null,
    from: user(author, authorId),
    body: { contentType: 'html', content: html },
    channelIdentity: { teamId: TEAM, channelId: CHANNEL },
    attachments: [],
    mentions: [],
    reactions,
    messageHistory: [],
    'replies@odata.count': replies.length,
    replies,
  };
}

function reply({ hoursAgo, author, authorId, text }) {
  const id = nextId();
  return {
    id,
    replyToId: null,
    etag: id,
    messageType: 'message',
    createdDateTime: ago(hoursAgo),
    lastModifiedDateTime: ago(hoursAgo),
    deletedDateTime: null,
    from: user(author, authorId),
    body: { contentType: 'text', content: text },
    reactions: [],
  };
}

const messages = [
  // Unclaimed, well past the point of being embarrassing.
  message({
    hoursAgo: 149,
    author: 'Nadia Fischer',
    authorId: '11111111-1111-1111-1111-111111111111',
    html: 'Review please 🙏 <a href="https://github.com/digitecgalaxus/checkout-api/pull/4821">Fix idempotency key collision on retry</a>',
  }),

  // Unclaimed but fresh — Azure DevOps style link.
  message({
    hoursAgo: 3,
    author: 'Tobias Meier',
    authorId: '22222222-2222-2222-2222-222222222222',
    html: 'Small one, should be quick:<br>https://dev.azure.com/dgcontoso/Platform/_git/shipping/pullrequest/9912',
  }),

  // Picked up (👀 by two people) but not approved, with an active discussion.
  message({
    hoursAgo: 71,
    author: 'Sarah Brunner',
    authorId: '33333333-3333-3333-3333-333333333333',
    subject: 'Bump Node to 22 across build images',
    html: '<p>Needs a second pair of eyes on the Dockerfile changes.</p><p><a href="https://github.com/digitecgalaxus/build-images/pull/331">build-images#331</a></p>',
    reactions: [
      reaction('👀', null, 'Marco Keller', '44444444-4444-4444-4444-444444444444', 68),
      reaction('👀', null, 'Lena Vogt', '55555555-5555-5555-5555-555555555555', 40),
    ],
    replies: [
      reply({ hoursAgo: 66, author: 'Marco Keller', authorId: '44444444-4444-4444-4444-444444444444', text: 'Why pin the patch version here?' }),
      reply({ hoursAgo: 20, author: 'Sarah Brunner', authorId: '33333333-3333-3333-3333-333333333333', text: 'Reproducible builds — updated the comment.' }),
    ],
  }),

  // In review, idle for a while — the "stuck" case.
  message({
    hoursAgo: 52,
    author: 'Marco Keller',
    authorId: '44444444-4444-4444-4444-444444444444',
    html: 'https://github.com/digitecgalaxus/search-indexer/pull/77 — refactors the batching loop, no behaviour change.',
    reactions: [reaction('👀', null, 'Nadia Fischer', '11111111-1111-1111-1111-111111111111', 50)],
  }),

  // Approved: ✅ alongside a 👀 — the checkmark must win.
  message({
    hoursAgo: 30,
    author: 'Lena Vogt',
    authorId: '55555555-5555-5555-5555-555555555555',
    html: 'https://github.com/digitecgalaxus/checkout-api/pull/4830 ready for review',
    reactions: [
      reaction('👀', null, 'Tobias Meier', '22222222-2222-2222-2222-222222222222', 28),
      reaction('✅', null, 'Tobias Meier', '22222222-2222-2222-2222-222222222222', 26),
    ],
  }),

  // Approved via a tenant custom emoji (reactionType "custom", name in displayName).
  message({
    hoursAgo: 26,
    author: 'Tobias Meier',
    authorId: '22222222-2222-2222-2222-222222222222',
    html: 'https://github.com/digitecgalaxus/pricing/pull/1204',
    reactions: [reaction('custom', 'approved', 'Sarah Brunner', '33333333-3333-3333-3333-333333333333', 22)],
  }),

  // Approved via ✔️ carrying a U+FE0F variation selector.
  message({
    hoursAgo: 22,
    author: 'Nadia Fischer',
    authorId: '11111111-1111-1111-1111-111111111111',
    html: 'https://gitlab.com/dg/tools/-/merge_requests/58',
    reactions: [reaction('✔️', null, 'Marco Keller', '44444444-4444-4444-4444-444444444444', 18)],
  }),

  // Channel chatter with no PR link — must be filtered out.
  message({
    hoursAgo: 5,
    author: 'Sarah Brunner',
    authorId: '33333333-3333-3333-3333-333333333333',
    html: 'Anyone up for lunch at 12:15?',
    reactions: [reaction('👍', null, 'Lena Vogt', '55555555-5555-5555-5555-555555555555', 4)],
  }),

  // A join/leave event — Graph mixes these in and they must be dropped.
  {
    id: nextId(),
    messageType: 'systemEventMessage',
    createdDateTime: ago(80),
    deletedDateTime: null,
    from: null,
    body: { contentType: 'html', content: '<systemEventMessage/>' },
    reactions: [],
    eventDetail: {
      '@odata.type': '#microsoft.graph.membersAddedEventMessageDetail',
      members: [{ id: '66666666-6666-6666-6666-666666666666' }],
    },
  },

  // A deleted message — tombstones still come back from Graph.
  {
    ...message({
      hoursAgo: 90,
      author: 'Lena Vogt',
      authorId: '55555555-5555-5555-5555-555555555555',
      html: 'https://github.com/digitecgalaxus/oops/pull/1',
    }),
    deletedDateTime: ago(89),
    body: { contentType: 'html', content: '<div></div>' },
  },
];

const outPath = join(dirname(fileURLToPath(import.meta.url)), 'messages.sample.json');
const payload = {
  '@odata.context': `https://graph.microsoft.com/v1.0/$metadata#teams('${TEAM}')/channels('${CHANNEL}')/messages`,
  '@odata.count': messages.length,
  value: messages,
};
await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`wrote ${outPath} (${messages.length} messages)`);
