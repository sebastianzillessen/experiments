# Teams Bot Exploration — Knowledge Base Auto-Responder

**Status:** Spec / research notes. No code yet.
**Branch:** `claude/teams-bot-exploration-MUUxD`
**Last updated:** 2026-04-08

## Goal

Build a bot for a Microsoft Teams channel that:

1. Passively reads **all** incoming messages — both Datadog alerts (delivered as Adaptive Cards) and human-authored questions.
2. Queries an internal knowledge base via RAG and replies in-thread with an answer.
3. Escalates to an on-call engineer when confidence is low or the question is out of scope.
4. Uses **DG AI** (internal company AI platform) for response generation and KB lookup.

## Phase 0 — Confluence MCP Setup (blocker)

The first step is connecting Claude Code to company Confluence so we can (a) check for existing work on a Teams bot and (b) find documentation on DG AI.

**Recommended: official Atlassian Remote MCP Server** (OAuth, no API-token management).

Add via CLI:

```bash
claude mcp add atlassian --type remote --url https://mcp.atlassian.com/v1/mcp
```

Or in `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "atlassian": {
      "type": "remote",
      "url": "https://mcp.atlassian.com/v1/mcp",
      "auth": { "type": "oauth" }
    }
  }
}
```

**What's needed from the user:**
- Atlassian Cloud site URL (e.g. `company.atlassian.net`)
- OAuth consent on first use (browser popup)
- Existing Confluence permissions are respected automatically

> Note (2026): after June 30 2026 the old `/sse` endpoint is deprecated; use `/v1/mcp`.

Fallback: community server `sooperset/mcp-atlassian` if the official server can't be used (e.g. on-prem Data Center instance).

## Phase 1 — Confluence Research (blocked on Phase 0)

Once the Atlassian MCP is connected, search for:

1. **Existing Teams-bot work** — queries: `"Teams bot"`, `"MS Teams integration"`, `"Datadog Teams"`, `"on-call bot"`. If anything exists, reuse/extend rather than rebuild.
2. **DG AI documentation** — API endpoint, auth method (OAuth / API key / mTLS?), request/response format, available models, RAG/KB features, rate limits, cost.
3. **Datadog → Teams alert format** — confirm how alerts currently reach the target channel and which fields the Adaptive Card carries.
4. **Escalation process** — how engineers are paged today (PagerDuty? Opsgenie? Teams @mention? a custom rota?).

Capture notes in `teams-bot-exploration/RESEARCH.md` (to be created).

## Phase 2 — Platform Options (public research, already done)

| Option | Reads ALL messages? | Replies in-thread? | Verdict |
|---|---|---|---|
| Graph API + Change Notifications | Yes (with RSC) | **No** — can't send as the app | ❌ |
| Copilot Studio | No — @mention only | Yes | ❌ |
| Incoming Webhooks | No — outbound only | Limited | ❌ |
| Bot Framework SDK | Yes (with RSC `ChannelMessage.Read.Group`) | Yes | ✅ viable |
| **Teams AI Library** (TypeScript) | **Yes (RSC)** | **Yes** | ✅ **recommended** |

### Why Teams AI Library

- Built on top of Bot Framework SDK (same RSC model, same hosting).
- Ships with a built-in `DataSource` interface designed for RAG.
- AI planner + action system maps cleanly onto "answer from KB" vs "escalate".
- Microsoft's strategic direction for AI-powered Teams bots.

### Key constraints

- Azure subscription (Bot Service free **F0** tier is sufficient).
- Azure AD App Registration (provides the bot identity).
- Teams App manifest with **`ChannelMessage.Read.Group`** RSC permission — this is what lets the bot see *all* messages in the channel, not just @mentions. Consent is by team owner; no tenant-admin approval required.
- HTTPS hosting (Azure App Service, Container Apps, or equivalent).
- **DG AI** replaces Azure OpenAI as the LLM/RAG backend in the standard Teams AI Library stack. Exact wiring depends on DG AI's interface (to be learned in Phase 1).

## Phase 3 — Proposed Scaffold

TypeScript prototype. Exact layout depends on Phase 1 findings, but the starting shape is:

| File | Purpose |
|---|---|
| `README.md` | Overview, prerequisites, setup, architecture |
| `RESEARCH.md` | Phase 1 Confluence findings |
| `package.json` | Deps: `botbuilder`, `@microsoft/teams-ai`, DG AI client (TBD) |
| `tsconfig.json` | TypeScript config |
| `.env.example` | Bot ID/secret, DG AI endpoint/key, etc. |
| `src/index.ts` | Bot entrypoint — Teams AI `Application` + message handler |
| `src/dgAiClient.ts` | Wrapper around DG AI API (built from Confluence docs) |
| `src/knowledgeBase.ts` | `DataSource` implementation — RAG via DG AI |
| `src/escalation.ts` | Escalation action (on-call @mention or integration with existing paging system) |
| `src/adaptiveCardParser.ts` | Extract alert metadata from Datadog Adaptive Cards |
| `appPackage/manifest.json` | Teams manifest w/ `ChannelMessage.Read.Group` RSC |
| `appPackage/color.png`, `outline.png` | Placeholder icons |

### Architecture

```
Teams Channel
    │
    ▼
Azure Bot Service (free F0)
    │
    ▼
Bot App (Teams AI Library, TypeScript)
    ├── Classifier: Datadog Adaptive Card vs. human question
    ├── DataSource → DG AI (RAG + LLM)
    └── Actions:
         ├── reply in-thread (high confidence)
         └── escalate to on-call engineer (low confidence / out of scope)
```

## Execution Order (when work resumes)

1. ✅ Write this spec
2. ⬜ Configure Atlassian MCP (`claude mcp add …`), complete OAuth
3. ⬜ Phase 1 research → write `RESEARCH.md`
4. ⬜ **Decision point:** if an existing Teams bot is found, pivot to reuse/extend it and re-confirm with the user before scaffolding
5. ⬜ Otherwise, create the scaffold above wired to DG AI
6. ⬜ Verify: `npm install`, `npx tsc --noEmit`, validate manifest JSON
7. ⬜ Commit & push to `claude/teams-bot-exploration-MUUxD`

## Open Questions (for Phase 1 to answer)

- Does DG AI expose a RAG-ready endpoint, or do we need a separate vector store?
- What auth scheme does DG AI use?
- Is there a preferred hosting pattern company-wide (internal k8s? Azure? something else)?
- What is the existing escalation channel/process for the target Teams channel?
- Has anyone already built a similar Teams bot we should reuse instead?
