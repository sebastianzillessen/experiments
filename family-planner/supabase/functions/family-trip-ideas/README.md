# family-trip-ideas

Trip suggestions for one canton, for a family working through all 26.

```
POST /functions/v1/family-trip-ideas
{ "family_id": "…", "canton": "GR", "wishes": "mit Kinderwagen", "refresh": false }
→ { "ideas": [ { "id", "title", "summary", "highlights", "duration", "season", "travel" } ],
    "cached": true, "generated_at": "2026-09-21T…" }
```

Only members may call it, and only owners and editors get as far as the model —
every generated batch costs money. Suggestions are cached per canton and handed
back unencumbered unless `refresh` is set or the wishes changed, so opening the
same canton twice is free.

The model is the only source: no web search, no live opening hours. The prompt
therefore leans on *leave it out if you are not sure*, forbids anything that
goes stale (hours, prices, addresses), and `ideas.ts` drops whatever comes back
malformed. The screen says the details want checking before anyone drives.

`CLAUDE_API_KEY` is required:

```bash
supabase secrets set CLAUDE_API_KEY=sk-ant-… --project-ref <ref>
```
