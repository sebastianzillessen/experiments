# `family-menu-import` Edge Function

Reads the school's weekly lunch menu out of its PDF and hands back checked
JSON. It writes nothing — the caller shows the week for confirming first.

## Why this needs a model at all

The PDFs the school publishes are **scans**: one page, one embedded JPEG
(2456×3484, DeviceRGB), no text layer whatsoever. `pdftotext` and every other
parser return an empty file. There is no simpler route to prefer over this one.

The content is regular, which helps: a header naming the week and its dates,
one row per weekday with one to three dishes, and three legend symbols for
gluten-free, lactose-free and seasonal. The caterer is menuandmore, so the
layout is likely the same across Zurich schools.

## Flow

```
POST /functions/v1/family-menu-import
Authorization: Bearer <USER_JWT>
{ "family_id": "<uuid>", "year": 2026, "week": 37, "pdf_base64": "<optional>" }

→ { "menu": { "year", "week", "from", "to",
              "days": [{ "date", "dishes": [{ "name", "tags" }] }] },
    "source": "school" | "upload", "url_tried": "…" }
```

1. Check the JWT, then the membership. Owner or editor only — a run costs
   money, so it is for people who may change the plan anyway.
2. Without `year`/`week`, take the current week **in the family's time zone**.
   At 01:00 on a Monday a server on UTC would otherwise fetch last week.
3. Without `pdf_base64`, fetch the week from the school: the files are named
   `{week}.{yy}.pdf` (`37.26.pdf`). Weeks below ten have not come round in the
   observed sample, so both `7.26.pdf` and `07.26.pdf` are tried.
4. Send the PDF to Claude (`claude-opus-5`) with a JSON schema, then check what
   comes back against the week that was asked for.

`pdf_base64` is the way back in if the school ever renames its files. Fetching
is limited to `https://www.stadt-zuerich.ch` — this function holds a
service-role key, so anything it can be talked into fetching would be a hole.

## What the model is told, and why

Two instructions matter more than the rest. Dish names are copied **exactly as
printed** — Swiss spellings (`Erbsli`, `Rüebli`, `Brötli`, `ss` for `ß`) and
markers like `(R)`, `(ASC)`, `(Vegi)` stay as they are, with no translating and
no correcting. And a dish that cannot be read with confidence is **left out**
rather than guessed at: an invented but plausible Swiss dish is the failure
nobody notices, so a gap is the cheaper outcome.

`menu.ts` then re-checks the answer. Structured outputs pin the *shape*, but a
schema cannot tell a right date from a wrong one, so a day outside the week, a
repeated day or an empty dish is dropped, and a week with nothing left is
reported as unread rather than written as empty.

`menu.ts` uses no Deno and no SDK, so the vitest suite
(`family-planner/tests/menu.test.ts`) checks the very same code.

## Cost

One page is about 2,300 input tokens. With `claude-opus-5` ($5 / $25 per
million) a menu costs roughly three to four Rappen, so a school year of weekly
imports is a couple of francs.

## Configuration

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` come from
the runtime. On top of those:

```bash
supabase secrets set CLAUDE_API_KEY="sk-ant-…" --project-ref tbknudbcgaarqixweizj
```

Without it the function refuses with a clear message instead of failing
halfway. The `jose` import map next door has its counterpart here in
`deno.json`, which pins the SDK and zod versions.

## Deployment

A push to `main` runs `.github/workflows/family-planner-supabase.yml`, which
deploys this alongside `family-calendar-sync`.

By hand:

```bash
supabase functions deploy family-menu-import --project-ref tbknudbcgaarqixweizj
```

## Trying it

```bash
curl -i -X POST http://localhost:54421/functions/v1/family-menu-import \
  -H "Authorization: Bearer <USER_JWT>" -H "Content-Type: application/json" \
  -d '{"family_id":"<uuid>","year":2026,"week":37}'
```
