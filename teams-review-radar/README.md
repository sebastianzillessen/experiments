# Teams Review Radar

Lists messages in a Teams channel that ask for a PR review but **have no ✅ reaction yet**,
split into *unclaimed* (nobody reacted) and *in review* (someone added 👀, still no ✅).
Renders a self-contained HTML dashboard.

Built for a channel used as a review queue: post a PR link, reviewer adds 👀 when they pick it
up, ✅ when it's approved, discussion happens in the replies.

## Why it is built this way

Reading channel messages from Graph needs delegated `ChannelMessage.Read.All`, which
**requires tenant admin consent** — usually the blocker.

The way around it: the Power Automate **Microsoft Teams connector** ships a
`Send a Microsoft Graph HTTP request` action that proxies Graph calls under *your* identity
through the already-consented connector app. No app registration, no admin consent.

So Power Automate is used purely as a **data pump**, and all logic stays local:

```
Power Automate (scheduled)
  └─ Send a Microsoft Graph HTTP request   GET /teams/{id}/channels/{id}/messages?$top=50&$expand=replies
       └─ OneDrive for Business: Create file → messages.json
            └─ OneDrive desktop sync
                 └─ node index.js → dashboard.html
```

OneDrive sync is what gets a cloud flow's output onto local disk without hosting anything or
authenticating a second time. The CLI only ever reads a JSON file, so it runs against the
bundled fixture with **zero Teams access**.

### What the research established

- `GET /teams/{teamId}/channels/{channelId}/messages` returns `reactions[]` inline on every
  message. `reactionType` holds the **literal unicode emoji** (`"✅"`, `"👀"`), a legacy name
  (`like`, `heart`), or `"custom"` for tenant custom emoji with the name in `displayName`.
  All three are handled — see `src/classify.js`.
- `$expand=replies` returns the conversation in the same call. `$top` caps at 50.
- **`$filter` and `$orderby` are not supported** on this endpoint, so date filtering happens
  locally. Results are ordered by last-modified of the whole reply chain.
- This endpoint is **not metered**. Teams API billing models were retired on 2025-08-25 and
  only ever applied to the `getAllMessages` *export* endpoints.
- Power Automate has **no reaction trigger**, so this polls; it cannot be event-driven.

## Quick start (no Teams access needed)

```bash
npm run demo          # renders out/dashboard.html from the bundled fixture
npm test              # 30 unit tests
open out/dashboard.html
```

Other output modes:

```bash
node index.js -i sample-data/messages.sample.json --text   # plain-text summary
node index.js -i sample-data/messages.sample.json --json   # normalized JSON
node index.js -i sample-data/messages.sample.json --all    # include non-PR chatter
```

## Setting up the real data feed

### 1. Get the team and channel IDs

In Teams: channel → **⋯ → Get link to channel**. The URL contains both IDs:

```
https://teams.microsoft.com/l/channel/19%3Aabc...%40thread.tacv2/Development?groupId=fbe2bf47-...
                                      └─ channelId (URL-decode %3A → :, %40 → @)   └─ teamId
```

### 2. Build the flow

1. Power Automate → **Create → Scheduled cloud flow** (use a *manual* trigger while testing).
2. Add action **Microsoft Teams → Send a Microsoft Graph HTTP request**:
   - Method: `GET`
   - URI:
     ```
     https://graph.microsoft.com/v1.0/teams/{teamId}/channels/{channelId}/messages?$top=50&$expand=replies
     ```
3. **Run it once and check the output before going further** — see *Verify first* below.
4. Add action **OneDrive for Business → Create file**:
   - Folder: `/Apps/teams-review-radar/`
   - File name: `messages.json`
   - File content: the **Body** of step 2
   - (Set conflict behaviour to overwrite, or use *Update file* once the file exists.)
5. Set the schedule — every 30–60 minutes is plenty.

### 3. Point the CLI at the synced file

```bash
cp config.example.json config.json
# edit inputPath to the local OneDrive path, e.g.
#   ~/OneDrive - Contoso/Apps/teams-review-radar/messages.json
node index.js
```

### Verify first

Before wiring up OneDrive and the schedule, run the flow with only step 2 and open the run
history. Confirm:

- the action returns **200**, not 403 — this is the go/no-go for the whole approach;
- `reactions[]` is populated with `"✅"` / `"👀"` on a message you know has them.

Copy that raw JSON into a local file and feed it straight in to sanity-check against real data:

```bash
node index.js --input ./real-run.json --text
```

## Known limitations and fallbacks

| Issue | What to do |
| --- | --- |
| **Only 50 root messages per call.** | Add a *Do Until* on `@odata.nextLink`, capped at ~5 iterations, appending each page. The parser accepts an array of pages as well as a single page. Note the action's URI validator may reject a full `nextLink`; if so, stay on one page — for a channel polled hourly that is enough. |
| **The Graph passthrough returns 403.** | Fall back to copying the run output manually (`--input`), which keeps everything but the automation. Longer term: a Teams app with `ChannelMessage.Read.Group` resource-specific consent — approved by a *team owner*, not a tenant admin — or a normal app registration with admin consent. |
| **The dashboard is empty.** | The PR patterns probably don't match your links. Run with `--all` to see everything, then fix `prPatterns` in `config.json`. |
| **Custom `:approved:` emoji not recognised.** | Add its name to `reactions.approvedNames` — custom emoji arrive as `reactionType: "custom"` with the name in `displayName`. |
| **Stale data.** | The dashboard header shows the dump file's mtime as "Data as of …". If that is hours old, the flow is not running. |

The connector's native *Get messages in a channel* action is deliberately **not** used: its
declared response schema does not surface `reactions`.

## Configuration

`config.json` (copy from `config.example.json`) — every key is optional and overrides the
built-in defaults in `src/defaults.js`. Overrides merge per key, so replacing `approved`
leaves the `inReview` list intact.

```jsonc
{
  "inputPath": "~/OneDrive - Contoso/Apps/teams-review-radar/messages.json",
  "outputPath": "out/dashboard.html",
  "reactions": {
    "approved": ["✅", "✔️", "☑️"],       // emoji that mean "approved"
    "inReview": ["👀", "🔍"],             // emoji that mean "picked up"
    "approvedNames": ["approved", "lgtm"], // custom-emoji names
    "inReviewNames": ["eyes", "reviewing"]
  },
  "prPatterns": ["github\\.com/[^/\\s\"']+/[^/\\s\"']+/pull/\\d+"],
  "requirePrMatch": true                   // false = list every message
}
```

Emoji are compared with variation selectors (U+FE0F) and skin-tone modifiers stripped, so a
configured `✔` matches a reacted `✔️`.

## Layout

```
index.js                     CLI
src/parse.js                 Graph JSON → normalized messages
src/classify.js              reaction matching + PR detection → open / inReview / approved
src/render.js                → self-contained HTML
src/defaults.js              built-in config, merged with config.json
sample-data/generate.js      regenerates the fixture with fresh timestamps
test/                        node:test unit tests
```

Node 22+, zero runtime dependencies.
