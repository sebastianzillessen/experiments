/**
 * Cloudflare Worker für die Packliste-App.
 *
 * Routes:
 *   POST /api/packliste/share           Body: <snapshot-json>
 *                                       → 201 { "code": "ABC234" }
 *   GET  /api/packliste/share/:code     → 200 <snapshot-json> (raw)
 *   *                                   → fällt durch auf statische Assets
 *
 * KV-Setup (einmalig):
 *   npx wrangler kv:namespace create PACKLISTE_KV
 *   → die zurückgegebene ID in wrangler.jsonc unter kv_namespaces[0].id
 *     eintragen.
 *
 * Ohne KV-Binding antwortet der Share-Endpunkt mit 503 — die App
 * funktioniert trotzdem, nur das Code-Sharing ist deaktiviert.
 */

interface Env {
  ASSETS: Fetcher;
  PACKLISTE_KV?: KVNamespace;
}

const PREFIX = "/api/packliste/share";
const MAX_BYTES = 500_000;
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 Tage
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O/1/I
const CODE_LENGTH = 6;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === PREFIX || url.pathname.startsWith(`${PREFIX}/`)) {
      return handleShare(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

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

function generateCode(): string {
  const buf = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  }
  return s;
}

async function handleShare(request: Request, env: Env, url: URL): Promise<Response> {
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
  if (request.method === "POST" && url.pathname === PREFIX) {
    const body = await request.text();
    if (body.length === 0) return jsonResponse({ error: "Leerer Body" }, 400);
    if (body.length > MAX_BYTES) {
      return jsonResponse(
        { error: `Snapshot zu groß (max ${MAX_BYTES} Bytes)` },
        413,
      );
    }
    try {
      JSON.parse(body);
    } catch {
      return jsonResponse({ error: "Ungültiges JSON" }, 400);
    }
    // Bis zu 3 Versuche, falls (sehr unwahrscheinlich) Collision
    let code = generateCode();
    for (let i = 0; i < 3; i++) {
      const existing = await env.PACKLISTE_KV.get(code);
      if (existing === null) break;
      code = generateCode();
    }
    await env.PACKLISTE_KV.put(code, body, { expirationTtl: TTL_SECONDS });
    return jsonResponse({ code, expiresInDays: 30 }, 201);
  }

  // PUT /api/packliste/share/:code — bestehenden Code aktualisieren
  // (für die laufende Sync — bevor PUT erlauben wir nur Updates auf
  // existierende Codes, damit man nicht beliebige Codes "besetzen" kann)
  const putMatch = url.pathname.match(/^\/api\/packliste\/share\/([A-Z2-9]+)$/);
  if (request.method === "PUT" && putMatch) {
    const code = putMatch[1];
    if (code.length !== CODE_LENGTH) {
      return jsonResponse({ error: "Ungültiges Code-Format" }, 400);
    }
    const body = await request.text();
    if (body.length === 0) return jsonResponse({ error: "Leerer Body" }, 400);
    if (body.length > MAX_BYTES) {
      return jsonResponse(
        { error: `Snapshot zu groß (max ${MAX_BYTES} Bytes)` },
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
    await env.PACKLISTE_KV.put(code, body, { expirationTtl: TTL_SECONDS });
    return jsonResponse({ ok: true }, 200);
  }

  // GET /api/packliste/share/:code
  const match = url.pathname.match(/^\/api\/packliste\/share\/([A-Z2-9]+)$/);
  if (request.method === "GET" && match) {
    const code = match[1];
    if (code.length !== CODE_LENGTH) {
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
