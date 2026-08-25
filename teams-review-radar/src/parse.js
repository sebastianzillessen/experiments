/**
 * Normalizes whatever the Power Automate flow dumped into the JSON file.
 *
 * Graph returns one page as `{ "value": [ ...chatMessage ] }`. If the flow pages with a
 * Do-Until loop the file ends up as an array of those pages instead, and a hand-pasted
 * payload is sometimes just the bare message array — accept all three.
 */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decodes the entity subset Teams actually emits in `body.content`. */
function decodeEntities(html) {
  return html
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&(\w+);/g, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Turns a Teams HTML message body into readable plain text. Block-level tags become
 * newlines so a multi-line post does not collapse into one run-on line.
 */
export function htmlToText(content, contentType = 'html') {
  if (!content) return '';
  if (contentType === 'text') return content.trim();

  const withBreaks = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');

  return decodeEntities(withBreaks.replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/** `chatMessageReactionIdentitySet` nests the identity one level deeper than you'd expect. */
function reactionUserName(reaction) {
  return reaction.user?.user?.displayName ?? reaction.user?.displayName ?? null;
}

function normalizeReaction(reaction) {
  return {
    type: reaction.reactionType ?? '',
    displayName: reaction.displayName ?? null,
    user: reactionUserName(reaction),
    createdDateTime: reaction.createdDateTime ?? null,
  };
}

/**
 * Pulls the message array out of a Graph page, an array of pages, or a bare array.
 * Throws on a Graph error envelope — a 403 from the flow lands in the dump file as JSON
 * and must not be mistaken for "the channel is empty".
 */
export function extractMessages(payload) {
  if (payload == null) throw new Error('Input file is empty');

  if (payload.error) {
    const { code, message } = payload.error;
    throw new Error(`Graph returned an error instead of messages: ${code ?? 'unknown'} — ${message ?? ''}`);
  }

  if (Array.isArray(payload)) {
    // Either a bare message array or an array of pages from the flow's Do-Until loop.
    return payload.flatMap((entry) => (entry && Array.isArray(entry.value) ? entry.value : [entry]));
  }

  if (Array.isArray(payload.value)) return payload.value;

  throw new Error('Unrecognized input shape: expected a Graph response, an array of pages, or an array of messages');
}

function normalizeReply(reply) {
  return {
    id: reply.id,
    author: reply.from?.user?.displayName ?? null,
    createdDateTime: reply.createdDateTime ?? null,
    text: htmlToText(reply.body?.content, reply.body?.contentType),
  };
}

/**
 * Graph mixes real posts with join/leave/rename events. Those have `messageType`
 * `systemEventMessage` (or `unknownFutureValue` on older payloads) and a null `from`.
 */
function isRealMessage(message) {
  if (message.deletedDateTime) return false;
  if (message.messageType && message.messageType !== 'message') return false;
  return true;
}

/** @returns {Array} one normalized item per root message, newest first. */
export function parseMessages(payload) {
  return extractMessages(payload)
    .filter((message) => message && isRealMessage(message))
    .map((message) => {
      const replies = (message.replies ?? []).filter(isRealMessage).map(normalizeReply);
      // `replies` comes back newest-first; the last reply is whichever has the max timestamp.
      const lastReply = replies.reduce(
        (latest, reply) =>
          !latest || (reply.createdDateTime ?? '') > (latest.createdDateTime ?? '') ? reply : latest,
        null,
      );

      return {
        id: message.id,
        webUrl: message.webUrl ?? null,
        createdDateTime: message.createdDateTime ?? null,
        author: message.from?.user?.displayName ?? null,
        text: htmlToText(message.body?.content, message.body?.contentType),
        rawHtml: message.body?.content ?? '',
        subject: message.subject || null,
        reactions: (message.reactions ?? []).map(normalizeReaction),
        replyCount: replies.length,
        lastReplyAt: lastReply?.createdDateTime ?? null,
        lastReplyAuthor: lastReply?.author ?? null,
      };
    })
    .sort((a, b) => (b.createdDateTime ?? '').localeCompare(a.createdDateTime ?? ''));
}
