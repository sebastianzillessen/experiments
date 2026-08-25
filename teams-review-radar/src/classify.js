/**
 * Decides which messages are review requests and how far along they are.
 *
 * Graph reports `reactionType` as the literal unicode emoji ("✅", "👀"), as a legacy
 * name ("like", "heart"), or as "custom" for tenant custom emoji — in which case the
 * name lands in `displayName`. All three are matched here.
 */

import { resolveConfig } from './defaults.js';

export const STATE = {
  OPEN: 'open',
  IN_REVIEW: 'inReview',
  APPROVED: 'approved',
};

const VARIATION_SELECTORS = /[\uFE00-\uFE0F]/g;
const SKIN_TONES = /[\u{1F3FB}-\u{1F3FF}]/gu;

/**
 * Strips the presentation modifiers that make otherwise-identical emoji compare unequal:
 * "✔️" (U+2714 U+FE0F) must match a configured "✔", and "👍🏽" must match "👍".
 */
export function normalizeEmoji(value) {
  return String(value ?? '')
    .replace(VARIATION_SELECTORS, '')
    .replace(SKIN_TONES, '')
    .trim();
}

function toLookup(values) {
  return new Set((values ?? []).map((value) => normalizeEmoji(value)));
}

function toNameLookup(values) {
  return new Set((values ?? []).map((value) => String(value).trim().toLowerCase()));
}

function reactionMatches(reaction, emojis, names) {
  const type = normalizeEmoji(reaction.type);
  if (type && emojis.has(type)) return true;
  // Covers legacy `reactionType: "like"` as well as shortcode-style types.
  if (type && names.has(type.toLowerCase())) return true;
  const displayName = reaction.displayName?.trim().toLowerCase();
  return Boolean(displayName && names.has(displayName));
}

/** Builds the matchers once so they are not recompiled per message. */
export function compileRules(userConfig = {}) {
  const config = resolveConfig(userConfig);
  const reactions = config.reactions;
  return {
    approvedEmojis: toLookup(reactions.approved),
    approvedNames: toNameLookup(reactions.approvedNames),
    inReviewEmojis: toLookup(reactions.inReview),
    inReviewNames: toNameLookup(reactions.inReviewNames),
    prPatterns: (config.prPatterns ?? []).map((source) => new RegExp(source, 'i')),
  };
}

/** A message counts as a review request if any configured pattern hits its text or its raw HTML. */
export function isPrRequest(item, rules) {
  if (rules.prPatterns.length === 0) return true;
  return rules.prPatterns.some((pattern) => pattern.test(item.text) || pattern.test(item.rawHtml));
}

export function classifyItem(item, rules, now = Date.now()) {
  const approvers = [];
  const reviewers = [];

  for (const reaction of item.reactions) {
    if (reactionMatches(reaction, rules.approvedEmojis, rules.approvedNames)) {
      approvers.push(reaction);
    } else if (reactionMatches(reaction, rules.inReviewEmojis, rules.inReviewNames)) {
      reviewers.push(reaction);
    }
  }

  // A ✅ settles it even when a 👀 is still sitting on the message.
  let state = STATE.OPEN;
  if (approvers.length > 0) state = STATE.APPROVED;
  else if (reviewers.length > 0) state = STATE.IN_REVIEW;

  const createdAt = item.createdDateTime ? Date.parse(item.createdDateTime) : NaN;
  const lastActivity = item.lastReplyAt ? Date.parse(item.lastReplyAt) : createdAt;

  return {
    ...item,
    state,
    isPrRequest: isPrRequest(item, rules),
    approvers,
    reviewers,
    ageMs: Number.isNaN(createdAt) ? null : now - createdAt,
    idleMs: Number.isNaN(lastActivity) ? null : now - lastActivity,
  };
}

/**
 * @param items normalized messages from `parseMessages`
 * @param options.includeNonPr keep messages that match no PR pattern (the `--all` escape hatch)
 * @returns { open, inReview, approvedCount, skippedNonPr, generatedAt }
 */
export function classify(items, userConfig = {}, { now = Date.now(), includeNonPr = false } = {}) {
  const config = resolveConfig(userConfig);
  const rules = compileRules(config);
  const requirePr = config.requirePrMatch !== false && !includeNonPr;

  const classified = items.map((item) => classifyItem(item, rules, now));
  const relevant = requirePr ? classified.filter((item) => item.isPrRequest) : classified;

  // Oldest first: the thing that has been waiting longest is the thing to act on.
  const byAgeDesc = (a, b) => (b.ageMs ?? 0) - (a.ageMs ?? 0);

  return {
    open: relevant.filter((item) => item.state === STATE.OPEN).sort(byAgeDesc),
    inReview: relevant.filter((item) => item.state === STATE.IN_REVIEW).sort(byAgeDesc),
    approvedCount: relevant.filter((item) => item.state === STATE.APPROVED).length,
    skippedNonPr: classified.length - relevant.length,
    totalMessages: classified.length,
    generatedAt: new Date(now).toISOString(),
  };
}
