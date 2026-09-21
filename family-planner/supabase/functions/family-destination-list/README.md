# family-destination-list

Turns a description into a list of places to tick off.

```
POST /functions/v1/family-destination-list
{ "family_id": "…", "request": "Hauptstädte in Europa" }
→ { "group": "Hauptstädte Europas", "note": "",
    "items": [ { "name": "Amsterdam", "code": "NL" }, … ] }
```

Only members may call it, and only owners and editors get as far as the model —
every list costs money.

**It writes nothing.** The answer goes back to the screen, where the family
unticks what it does not want and the client writes the rest. The model is the
only source, so the prompt insists on completeness where a list has a fixed
size (all 16 Bundesländer, all 26 Kantone) and on leaving out anything it is
unsure of, and `list.ts` drops whatever comes back malformed.

`CLAUDE_API_KEY` is required:

```bash
supabase secrets set CLAUDE_API_KEY=sk-ant-… --project-ref <ref>
```
