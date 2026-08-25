/**
 * Built-in defaults so the tool is useful with no config.json at all.
 * config.example.json mirrors these; anything the user sets there wins.
 */
export const DEFAULT_CONFIG = {
  reactions: {
    approved: ['✅', '✔️', '☑️'],
    inReview: ['👀', '🔍'],
    approvedNames: ['approved', 'checkmark', 'check', 'done', 'lgtm'],
    inReviewNames: ['eyes', 'looking', 'reviewing'],
  },
  prPatterns: [
    'github\\.com/[^/\\s"\']+/[^/\\s"\']+/pull/\\d+',
    'dev\\.azure\\.com/[^\\s"\']+/pullrequest/\\d+',
    '/_git/[^/\\s"\']+/pullrequest/\\d+',
    'gitlab\\.com/[^\\s"\']+/-/merge_requests/\\d+',
  ],
  requirePrMatch: true,
};

/**
 * Merges user config over the defaults. `reactions` merges key by key so overriding
 * only `approved` does not silently wipe out the 👀 list.
 */
export function resolveConfig(userConfig = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    reactions: { ...DEFAULT_CONFIG.reactions, ...(userConfig.reactions ?? {}) },
  };
}
