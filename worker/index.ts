/**
 * Cloudflare Worker for the experiments site.
 *
 * Two API namespaces live on the same Worker:
 *   /api/hoko/*               → HotelKontrolle guest-registration
 *                                (POST /submit, GET /:code, KV: HOKO_KV,
 *                                 90-day TTL, host-notification via Resend)
 *   /api/packliste/share*     → Packliste cloud-sync
 *                                (POST, PUT/:code, GET/:code, KV: PACKLISTE_KV,
 *                                 30-day TTL with sliding window)
 *
 * Anything else falls through to the static-asset binding (`env.ASSETS`),
 * which serves the per-app builds from ./_site/. Host-based rewrites let a
 * single app appear at a subdomain root:
 *   * `hoko.zillessen.dev`      → /hoko<path>               (_site/hoko/)
 *   * `salaerli.zillessen.dev`  → /kinderbetreuung-lohn<path> (Salärli app)
 * Other hosts (e.g. zillessen.dev) keep serving the experiments overview.
 *
 * `run_worker_first: true` in wrangler.jsonc ensures THIS file runs on
 * every request — otherwise the assets binding short-circuits for paths
 * that map to a file in _site/, and the hoko hostname rewrite would
 * never get a chance to fire.
 *
 * One-time setup:
 *   npx wrangler kv namespace create HOKO_KV
 *   npx wrangler kv namespace create PACKLISTE_KV
 *     → paste the returned ids into wrangler.jsonc → kv_namespaces[]
 *
 *   npx wrangler secret put RESEND_API_KEY
 *   npx wrangler secret put HOST_NOTIFY_EMAIL
 *   npx wrangler secret put RESEND_FROM   # e.g. "HotelKontrolle <hoko@zillessen.dev>"
 *
 * Without HOKO_KV bound, /api/hoko/* responds 503.
 * Without PACKLISTE_KV bound, /api/packliste/share* responds 503.
 * Static asset serving keeps working regardless.
 */

interface Env {
  ASSETS: Fetcher;
  HOKO_KV?: KVNamespace;
  PACKLISTE_KV?: KVNamespace;
  RESEND_API_KEY?: string;
  HOST_NOTIFY_EMAIL?: string;
  RESEND_FROM?: string;
}

const HOKO_HOST = "hoko.zillessen.dev";
const HOKO_API_PREFIX = "/api/hoko";
const PACKLISTE_PREFIX = "/api/packliste/share";

// salaerli.zillessen.dev (and its umlaut/punycode form) serve the
// kinderbetreuung-lohn ("Salärli") app from the subdomain root instead of
// the experiments overview.
const SALAERLI_HOSTS = new Set([
  "salaerli.zillessen.dev",
  "xn--salrli-dua.zillessen.dev", // salärli.zillessen.dev
]);
const SALAERLI_PREFIX = "/kinderbetreuung-lohn";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === HOKO_API_PREFIX || url.pathname.startsWith(`${HOKO_API_PREFIX}/`)) {
      return handleHokoApi(request, env, ctx, url);
    }

    if (url.pathname === PACKLISTE_PREFIX || url.pathname.startsWith(`${PACKLISTE_PREFIX}/`)) {
      return handlePacklisteShare(request, env, url);
    }

    return serveAssets(request, env, url);
  },
};

// ---------------------------------------------------------------------------
// Static-asset serving + hoko.zillessen.dev hostname rewrite
// ---------------------------------------------------------------------------

function serveAssets(request: Request, env: Env, url: URL): Promise<Response> {
  const host = (request.headers.get("host") || url.hostname || "").toLowerCase();
  if (host === HOKO_HOST && !url.pathname.startsWith("/hoko")) {
    return fetchWithPrefix(request, env, url, "/hoko");
  }
  if (SALAERLI_HOSTS.has(host) && !url.pathname.startsWith(SALAERLI_PREFIX)) {
    return fetchWithPrefix(request, env, url, SALAERLI_PREFIX);
  }
  return env.ASSETS.fetch(request);
}

// Serve a subdomain's app from a sub-path of _site/ by internally rewriting
// the request path (so the app appears at the subdomain root). Relative asset
// requests (e.g. /app.js) are rewritten the same way on the next request.
function fetchWithPrefix(request: Request, env: Env, url: URL, prefix: string): Promise<Response> {
  const rewritten = new URL(request.url);
  rewritten.pathname = `${prefix}${url.pathname === "/" ? "/" : url.pathname}`;
  return env.ASSETS.fetch(new Request(rewritten.toString(), request));
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(
  data: unknown,
  status: number,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(),
      ...extra,
    },
  });
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Crockford-style, no 0/O/1/I

function generateCode(length: number): string {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return s;
}

// ===========================================================================
// HotelKontrolle (hoko) — guest registration
// ===========================================================================

const HOKO_MAX_BYTES = 50_000;
const HOKO_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const HOKO_CODE_LENGTH = 6;
const HOKO_CODE_REGEX = /^[A-Z0-9-]{4,64}$/; // tolerates airbnb-style reservation numbers and the 6-char auto code
const HOKO_DOC_TYPES = new Set(["Passport", "ID card", "Other"]);

interface GuestRow {
  firstname: string;
  lastname: string;
  country: string;
  countryIso: string;
  ausweisart: string;
  ausweisnummer: string;
}

interface StoredStay {
  code: string;
  ankunft: string;
  abreise: string;
  guests: GuestRow[];
  submittedAt: string;
}

function sanitiseStr(v: unknown, max = 200): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function parseSubmitBody(body: unknown): { ok: true; value: StoredStay } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  const ankunft = sanitiseStr(b.ankunft, 20);
  const abreise = sanitiseStr(b.abreise, 20);
  if (!ankunft) return { ok: false, error: "ankunft missing" };
  if (!abreise) return { ok: false, error: "abreise missing" };

  const rawGuests = Array.isArray(b.guests) ? b.guests : null;
  if (!rawGuests || rawGuests.length === 0) return { ok: false, error: "guests array empty" };
  if (rawGuests.length > 20) return { ok: false, error: "too many guests" };

  const guests: GuestRow[] = [];
  for (const raw of rawGuests) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "guest entry not an object" };
    const r = raw as Record<string, unknown>;
    const isoRaw = typeof r.countryIso === "string" ? r.countryIso.trim().toUpperCase() : "";
    if (isoRaw && !/^[A-Z]{2}$/.test(isoRaw)) {
      return { ok: false, error: "countryIso must be ISO 3166-1 alpha-2" };
    }
    const g: GuestRow = {
      firstname: sanitiseStr(r.firstname, 100),
      lastname: sanitiseStr(r.lastname, 100),
      country: sanitiseStr(r.country, 100),
      countryIso: isoRaw,
      ausweisart: sanitiseStr(r.ausweisart, 40),
      ausweisnummer: sanitiseStr(r.ausweisnummer, 60),
    };
    if (!g.firstname || !g.lastname || !g.country || !g.ausweisart || !g.ausweisnummer) {
      return { ok: false, error: "guest row missing required fields" };
    }
    if (!HOKO_DOC_TYPES.has(g.ausweisart)) {
      return { ok: false, error: "ausweisart invalid" };
    }
    guests.push(g);
  }

  let code = sanitiseStr(b.code, 64).toUpperCase();
  if (code && !HOKO_CODE_REGEX.test(code)) {
    return { ok: false, error: "code format invalid" };
  }

  return {
    ok: true,
    value: { code, ankunft, abreise, guests, submittedAt: new Date().toISOString() },
  };
}

async function handleHokoApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders(), "Access-Control-Max-Age": "86400" } });
  }

  if (!env.HOKO_KV) {
    return jsonResponse(
      {
        error:
          "HOKO_KV not bound. Run `npx wrangler kv namespace create HOKO_KV` and set the id in wrangler.jsonc.",
      },
      503,
    );
  }

  // POST /api/hoko/submit
  if (request.method === "POST" && url.pathname === `${HOKO_API_PREFIX}/submit`) {
    const text = await request.text();
    if (text.length === 0) return jsonResponse({ error: "Empty body" }, 400);
    if (text.length > HOKO_MAX_BYTES) {
      return jsonResponse({ error: `Body too large (max ${HOKO_MAX_BYTES} bytes)` }, 413);
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    const parsed = parseSubmitBody(body);
    if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);
    const stay = parsed.value;

    if (!stay.code) {
      let code = generateCode(HOKO_CODE_LENGTH);
      for (let i = 0; i < 3; i++) {
        const existing = await env.HOKO_KV.get(`hoko:${code}`);
        if (existing === null) break;
        code = generateCode(HOKO_CODE_LENGTH);
      }
      stay.code = code;
    }

    await env.HOKO_KV.put(`hoko:${stay.code}`, JSON.stringify(stay), {
      expirationTtl: HOKO_TTL_SECONDS,
    });

    // Send notification — don't block the response on email success.
    ctx.waitUntil(sendHostNotification(env, stay).catch((err) => console.error("notify failed", err)));

    return jsonResponse({ code: stay.code }, 201);
  }

  // GET /api/hoko/:code
  const match = url.pathname.match(/^\/api\/hoko\/([A-Z0-9-]{4,64})$/i);
  if (request.method === "GET" && match) {
    const code = match[1].toUpperCase();
    const value = await env.HOKO_KV.get(`hoko:${code}`);
    if (value === null) {
      return jsonResponse({ error: "Code not found or expired (90-day TTL)" }, 404);
    }
    return new Response(value, {
      status: 200,
      headers: { "content-type": "application/json", ...corsHeaders() },
    });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildNotificationText(stay: StoredStay): string {
  const lines: string[] = [
    "New HotelKontrolle data received.",
    "",
    `Code: ${stay.code}`,
    `Stay: ${stay.ankunft} – ${stay.abreise}`,
    `Guests (${stay.guests.length}):`,
  ];
  stay.guests.forEach((g, i) => {
    const iso = g.countryIso ? ` [${g.countryIso}]` : "";
    lines.push(`  ${i + 1}. ${g.lastname}, ${g.firstname} — ${g.country}${iso} — ${g.ausweisart}: ${g.ausweisnummer}`);
  });
  lines.push("", `To upload locally:  cd hoko-cli && npx tsx upload.ts ${stay.code}`);
  return lines.join("\n");
}

function buildNotificationHtml(stay: StoredStay): string {
  const rows = stay.guests
    .map((g, i) => {
      const iso = g.countryIso ? ` [${escapeHtml(g.countryIso)}]` : "";
      return `<li>${escapeHtml(g.lastname)}, ${escapeHtml(g.firstname)} — ${escapeHtml(g.country)}${iso} — ${escapeHtml(g.ausweisart)}: ${escapeHtml(g.ausweisnummer)}</li>`;
    })
    .join("");
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#1f2933;line-height:1.5">
<h2 style="color:#1a3a5c;margin-bottom:4px">New HotelKontrolle data received</h2>
<p><strong>Code:</strong> <code>${escapeHtml(stay.code)}</code><br>
<strong>Stay:</strong> ${escapeHtml(stay.ankunft)} – ${escapeHtml(stay.abreise)}</p>
<p><strong>Guests (${stay.guests.length}):</strong></p>
<ol>${rows}</ol>
<p style="color:#6b7480;font-size:13px">To upload locally:<br>
<code>cd hoko-cli &amp;&amp; npx tsx upload.ts ${escapeHtml(stay.code)}</code></p>
</body></html>`;
}

async function sendHostNotification(env: Env, stay: StoredStay): Promise<void> {
  if (!env.RESEND_API_KEY || !env.HOST_NOTIFY_EMAIL || !env.RESEND_FROM) {
    console.warn("Resend env incomplete — skipping email", {
      hasKey: !!env.RESEND_API_KEY,
      hasTo: !!env.HOST_NOTIFY_EMAIL,
      hasFrom: !!env.RESEND_FROM,
    });
    return;
  }

  const payload = {
    from: env.RESEND_FROM,
    to: [env.HOST_NOTIFY_EMAIL],
    subject: `New guest registration — code ${stay.code}`,
    text: buildNotificationText(stay),
    html: buildNotificationHtml(stay),
  };

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Resend ${resp.status}: ${errText}`);
  }
}

// ===========================================================================
// Packliste — cloud-sync share endpoint
// ===========================================================================

const PACKLISTE_MAX_BYTES = 500_000;
const PACKLISTE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 Tage
const PACKLISTE_CODE_LENGTH = 6;

async function handlePacklisteShare(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: { ...corsHeaders(), "Access-Control-Max-Age": "86400" },
    });
  }

  if (!env.PACKLISTE_KV) {
    return jsonResponse(
      {
        error:
          "KV-Namespace nicht eingerichtet. Befehl ausführen: `npx wrangler kv:namespace create PACKLISTE_KV` und die zurückgegebene ID in wrangler.jsonc setzen.",
      },
      503,
    );
  }

  // POST /api/packliste/share — neuen Code anlegen
  if (request.method === "POST" && url.pathname === PACKLISTE_PREFIX) {
    const body = await request.text();
    if (body.length === 0) return jsonResponse({ error: "Leerer Body" }, 400);
    if (body.length > PACKLISTE_MAX_BYTES) {
      return jsonResponse(
        { error: `Snapshot zu groß (max ${PACKLISTE_MAX_BYTES} Bytes)` },
        413,
      );
    }
    try {
      JSON.parse(body);
    } catch {
      return jsonResponse({ error: "Ungültiges JSON" }, 400);
    }
    // Bis zu 3 Versuche, falls (sehr unwahrscheinlich) Collision
    let code = generateCode(PACKLISTE_CODE_LENGTH);
    for (let i = 0; i < 3; i++) {
      const existing = await env.PACKLISTE_KV.get(code);
      if (existing === null) break;
      code = generateCode(PACKLISTE_CODE_LENGTH);
    }
    await env.PACKLISTE_KV.put(code, body, { expirationTtl: PACKLISTE_TTL_SECONDS });
    return jsonResponse({ code, expiresInDays: 30 }, 201);
  }

  // PUT /api/packliste/share/:code — bestehenden Code aktualisieren
  // (für die laufende Sync — bevor PUT erlauben wir nur Updates auf
  // existierende Codes, damit man nicht beliebige Codes "besetzen" kann)
  const putMatch = url.pathname.match(/^\/api\/packliste\/share\/([A-Z2-9]+)$/);
  if (request.method === "PUT" && putMatch) {
    const code = putMatch[1];
    if (code.length !== PACKLISTE_CODE_LENGTH) {
      return jsonResponse({ error: "Ungültiges Code-Format" }, 400);
    }
    const body = await request.text();
    if (body.length === 0) return jsonResponse({ error: "Leerer Body" }, 400);
    if (body.length > PACKLISTE_MAX_BYTES) {
      return jsonResponse(
        { error: `Snapshot zu groß (max ${PACKLISTE_MAX_BYTES} Bytes)` },
        413,
      );
    }
    try {
      JSON.parse(body);
    } catch {
      return jsonResponse({ error: "Ungültiges JSON" }, 400);
    }
    const existing = await env.PACKLISTE_KV.get(code);
    if (existing === null) {
      return jsonResponse(
        { error: "Code nicht gefunden — erst per POST anlegen" },
        404,
      );
    }
    // TTL bei jedem Update verlängern (sliding window)
    await env.PACKLISTE_KV.put(code, body, { expirationTtl: PACKLISTE_TTL_SECONDS });
    return jsonResponse({ ok: true }, 200);
  }

  // GET /api/packliste/share/:code
  const match = url.pathname.match(/^\/api\/packliste\/share\/([A-Z2-9]+)$/);
  if (request.method === "GET" && match) {
    const code = match[1];
    if (code.length !== PACKLISTE_CODE_LENGTH) {
      return jsonResponse({ error: "Ungültiges Code-Format" }, 400);
    }
    const value = await env.PACKLISTE_KV.get(code);
    if (value === null) {
      return jsonResponse(
        { error: "Code nicht gefunden oder abgelaufen (30 Tage TTL)" },
        404,
      );
    }
    return new Response(value, {
      status: 200,
      headers: { "content-type": "application/json", ...corsHeaders() },
    });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}
