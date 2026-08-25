/** Renders the classified result as one self-contained HTML file (no external assets). */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Compact human duration: "3d 4h", "5h", "12m". */
export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return 'unknown';
  if (ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/** Anything older than a working week is worth shouting about. */
function ageSeverity(ms) {
  const days = (ms ?? 0) / 86400000;
  if (days >= 5) return 'critical';
  if (days >= 2) return 'warn';
  return 'ok';
}

function excerpt(text, limit = 240) {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

function renderCard(item) {
  const names = item.reviewers.map((r) => r.user).filter(Boolean);
  const reviewerLine = item.reviewers.length
    ? `<div class="meta reviewers">👀 ${esc(names.join(', ') || `${item.reviewers.length} reaction(s)`)}</div>`
    : '';

  const replyLine = item.replyCount
    ? `<div class="meta">💬 ${item.replyCount} ${item.replyCount === 1 ? 'reply' : 'replies'}` +
      (item.lastReplyAuthor ? ` · last by ${esc(item.lastReplyAuthor)}` : '') +
      ` · idle ${esc(formatDuration(item.idleMs))}</div>`
    : '<div class="meta muted">no replies yet</div>';

  const link = item.webUrl
    ? `<a class="open" href="${esc(item.webUrl)}" target="_blank" rel="noopener">Open in Teams →</a>`
    : '';

  return `
      <li class="card ${esc(ageSeverity(item.ageMs))}">
        <div class="card-head">
          <span class="age">${esc(formatDuration(item.ageMs))}</span>
          <span class="author">${esc(item.author ?? 'unknown')}</span>
          ${link}
        </div>
        ${item.subject ? `<div class="subject">${esc(item.subject)}</div>` : ''}
        <p class="body">${esc(excerpt(item.text)) || '<span class="muted">(no text)</span>'}</p>
        ${reviewerLine}
        ${replyLine}
      </li>`;
}

function renderSection(title, hint, items, emptyText) {
  const body = items.length
    ? `<ul class="cards">${items.map(renderCard).join('')}</ul>`
    : `<p class="empty">${esc(emptyText)}</p>`;
  return `
    <section>
      <h2>${esc(title)} <span class="count">${items.length}</span></h2>
      <p class="hint">${esc(hint)}</p>
      ${body}
    </section>`;
}

/**
 * @param result output of `classify`
 * @param meta.sourcePath / meta.dataAsOf shown in the header so a stale OneDrive sync is obvious
 */
export function renderHtml(result, meta = {}) {
  const oldest = result.open[0] ?? result.inReview[0] ?? null;
  const stats = [
    ['Unclaimed', result.open.length],
    ['In review', result.inReview.length],
    ['Approved', result.approvedCount],
    ['Oldest waiting', oldest ? formatDuration(oldest.ageMs) : '—'],
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teams Review Radar</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f6f7f9; --fg: #14161a; --muted: #666e7a; --card: #fff;
    --line: #e2e5ea; --accent: #4f46e5;
    --ok: #2f8f4e; --warn: #b06f00; --critical: #c0392b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a; --fg: #e8eaed; --muted: #9aa3af; --card: #1d2026;
      --line: #2c313a; --accent: #8b85f5;
      --ok: #4cc46e; --warn: #e0a020; --critical: #ef6a5a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1.25rem 4rem; background: var(--bg); color: var(--fg);
    font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .wrap { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
  .asof { color: var(--muted); font-size: .85rem; margin: 0 0 1.5rem; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .75rem; margin-bottom: 2.5rem; }
  .stat { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: .85rem 1rem; }
  .stat .n { font-size: 1.6rem; font-weight: 650; }
  .stat .l { color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
  h2 { font-size: 1.1rem; margin: 0 0 .2rem; display: flex; align-items: center; gap: .5rem; }
  .count { background: var(--accent); color: #fff; border-radius: 999px; font-size: .75rem; padding: .1rem .55rem; font-weight: 600; }
  .hint { color: var(--muted); font-size: .85rem; margin: 0 0 1rem; }
  section { margin-bottom: 2.5rem; }
  .cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .75rem; }
  .card { background: var(--card); border: 1px solid var(--line); border-left: 4px solid var(--ok); border-radius: 10px; padding: .85rem 1rem; }
  .card.warn { border-left-color: var(--warn); }
  .card.critical { border-left-color: var(--critical); }
  .card-head { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; margin-bottom: .35rem; }
  .age { font-weight: 650; font-variant-numeric: tabular-nums; }
  .critical .age { color: var(--critical); }
  .warn .age { color: var(--warn); }
  .author { color: var(--muted); font-size: .9rem; }
  .open { margin-left: auto; color: var(--accent); text-decoration: none; font-size: .85rem; white-space: nowrap; }
  .open:hover { text-decoration: underline; }
  .subject { font-weight: 600; margin-bottom: .2rem; }
  .body { margin: .2rem 0 .5rem; white-space: pre-wrap; overflow-wrap: anywhere; }
  .meta { font-size: .85rem; color: var(--muted); }
  .reviewers { color: var(--fg); }
  .muted { color: var(--muted); }
  .empty { color: var(--muted); font-style: italic; }
  footer { color: var(--muted); font-size: .8rem; border-top: 1px solid var(--line); padding-top: 1rem; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Teams Review Radar</h1>
  <p class="asof">
    Data as of ${esc(meta.dataAsOf ?? 'unknown')}${meta.sourcePath ? ` · ${esc(meta.sourcePath)}` : ''}
    · rendered ${esc(result.generatedAt)}
  </p>

  <div class="stats">
    ${stats.map(([label, value]) => `<div class="stat"><div class="n">${esc(value)}</div><div class="l">${esc(label)}</div></div>`).join('')}
  </div>

  ${renderSection('Unclaimed', 'No reactions yet — nobody has picked these up.', result.open, 'Nothing unclaimed. 🎉')}
  ${renderSection('In review', 'Someone added 👀 but there is still no ✅.', result.inReview, 'Nothing sitting in review.')}

  <footer>
    Scanned ${esc(result.totalMessages)} channel messages;
    ${esc(result.skippedNonPr)} skipped as non-PR chatter.
    Re-run with <code>--all</code> to include them.
  </footer>
</div>
</body>
</html>
`;
}
