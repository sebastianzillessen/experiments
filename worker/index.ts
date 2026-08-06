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
 *   npx wrangler secret put AIRBNB_ICAL_URL  # optional — enables /api/hoko/airbnb-lookup/:code
 *   npx wrangler secret put HOKO_PULLER_TOKEN  # optional — gates /api/hoko/list for the Pi puller
 *
 * Without HOKO_KV bound, /api/hoko/* responds 503.
 * Without PACKLISTE_KV bound, /api/packliste/share* responds 503.
 * Static asset serving keeps working regardless.
 */

import * as XLSX from "xlsx";
import { TEMPLATE_XLT_BASE64 } from "./template";

interface Env {
  ASSETS: Fetcher;
  HOKO_KV?: KVNamespace;
  PACKLISTE_KV?: KVNamespace;
  WORKOUT_KV?: KVNamespace;
  RESEND_API_KEY?: string;
  HOST_NOTIFY_EMAIL?: string;
  RESEND_FROM?: string;
  AIRBNB_ICAL_URL?: string;
  HOKO_PULLER_TOKEN?: string;
  // VAPID keys for the 7-minute-workout reminder push (payload-less).
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string; // e.g. "mailto:you@zillessen.dev"
}

const HOKO_HOST = "hoko.zillessen.dev";
const HOKO_API_PREFIX = "/api/hoko";
const PACKLISTE_PREFIX = "/api/packliste/share";
const WORKOUT_API_PREFIX = "/api/workout";

// workout.zillessen.dev serves the 7-minute-workout PWA from the subdomain
// root instead of the experiments overview.
const WORKOUT_HOST = "workout.zillessen.dev";
const WORKOUT_PREFIX = "/seven-minutes-workout";

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

    if (url.pathname === WORKOUT_API_PREFIX || url.pathname.startsWith(`${WORKOUT_API_PREFIX}/`)) {
      return handleWorkoutApi(request, env, url);
    }

    return serveAssets(request, env, url);
  },

  // Cron-driven reminder push for the 7-minute-workout app. Configured in
  // wrangler.jsonc → triggers.crons (every 15 min). Sends a payload-less push
  // to each subscription whose local reminder time falls in the current window.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sendDueWorkoutReminders(env));
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
  if (host === WORKOUT_HOST && !url.pathname.startsWith(WORKOUT_PREFIX)) {
    return fetchWithPrefix(request, env, url, WORKOUT_PREFIX);
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
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

    // submittedAt also lives in the JSON value, but stashing it in KV
    // metadata lets /api/hoko/list filter by time without fetching every entry.
    await env.HOKO_KV.put(`hoko:${stay.code}`, JSON.stringify(stay), {
      expirationTtl: HOKO_TTL_SECONDS,
      metadata: { submittedAt: stay.submittedAt },
    });

    // Send notification — don't block the response on email success.
    ctx.waitUntil(sendHostNotification(env, stay).catch((err) => console.error("notify failed", err)));

    return jsonResponse({ code: stay.code }, 201);
  }

  // GET /api/hoko/airbnb-lookup/:code — return {ankunft, abreise} for a
  // reservation code listed in the host's Airbnb iCal feed.
  const airbnbMatch = url.pathname.match(/^\/api\/hoko\/airbnb-lookup\/([A-Z0-9-]{4,64})$/i);
  if (request.method === "GET" && airbnbMatch) {
    if (!env.AIRBNB_ICAL_URL) {
      return jsonResponse({ error: "Airbnb lookup not configured" }, 503);
    }
    const code = airbnbMatch[1].toUpperCase();
    let map: Record<string, AirbnbStay>;
    try {
      map = await getAirbnbLookup(env);
    } catch (err) {
      console.error("airbnb lookup failed", err);
      return jsonResponse({ error: "Airbnb feed fetch failed" }, 502);
    }
    const hit = map[code];
    if (!hit) return jsonResponse({ error: "code not found in Airbnb feed" }, 404);
    return jsonResponse(hit, 200);
  }

  // GET /api/hoko/list?since=<unix-ms> — used by the Pi puller to discover
  // new submissions. Bearer-auth via HOKO_PULLER_TOKEN so the full code list
  // isn't world-readable (individual codes still need their token to read).
  if (request.method === "GET" && url.pathname === `${HOKO_API_PREFIX}/list`) {
    if (!env.HOKO_PULLER_TOKEN) {
      return jsonResponse({ error: "Puller list not configured" }, 503);
    }
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${env.HOKO_PULLER_TOKEN}`) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const sinceMs = Number(url.searchParams.get("since") || "0") || 0;
    const items: { code: string; submittedAt: string }[] = [];
    let cursor: string | undefined;
    do {
      const page = await env.HOKO_KV.list<{ submittedAt?: string }>({
        prefix: "hoko:",
        cursor,
      });
      for (const k of page.keys) {
        const submittedAt = k.metadata?.submittedAt;
        if (!submittedAt) continue;
        if (Date.parse(submittedAt) > sinceMs) {
          items.push({ code: k.name.slice("hoko:".length), submittedAt });
        }
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    items.sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
    return jsonResponse(items, 200);
  }

  // GET /api/hoko/:code.xls — binary BIFF8, same bytes as the host email
  // attachment. The code itself is the auth (matches the existing JSON GET).
  const xlsMatch = url.pathname.match(/^\/api\/hoko\/([A-Z0-9-]{4,64})\.xls$/i);
  if (request.method === "GET" && xlsMatch) {
    const code = xlsMatch[1].toUpperCase();
    const value = await env.HOKO_KV.get<StoredStay>(`hoko:${code}`, "json");
    if (!value) {
      return jsonResponse({ error: "Code not found or expired (90-day TTL)" }, 404);
    }
    const bin = atob(buildMeldescheinXlsBase64(value));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/vnd.ms-excel",
        "content-disposition": `attachment; filename="meldeschein-${code}.xls"`,
        ...corsHeaders(),
      },
    });
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

// ---------------------------------------------------------------------------
// Airbnb iCal lookup — fetches the host's per-listing calendar export, parses
// out `<code> -> {ankunft, abreise}` (both DD.MM.YYYY), and caches the result
// in HOKO_KV for 15 min. Each VEVENT looks like:
//
//   DTSTART;VALUE=DATE:20260528
//   DTEND;VALUE=DATE:20260601
//   DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/de
//    tails/HMWARWKJDE\nPhone Number (Last 4 Digits): 7633
//
// DTEND is the checkout day for Airbnb all-day events, so we map it directly
// to abreise. iCal line folding (RFC 5545) inserts CRLF+SP inside long lines —
// we unfold first so the code stays whole.
// ---------------------------------------------------------------------------

interface AirbnbStay {
  ankunft: string;
  abreise: string;
}

const AIRBNB_CACHE_KEY = "airbnb:ical:v1";
const AIRBNB_CACHE_TTL = 60 * 15; // 15 min

function parseAirbnbIcal(text: string): Record<string, AirbnbStay> {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const out: Record<string, AirbnbStay> = {};
  const blocks = unfolded.split(/BEGIN:VEVENT/);
  for (const block of blocks.slice(1)) {
    const end = block.indexOf("END:VEVENT");
    if (end === -1) continue;
    const body = block.slice(0, end);
    const start = body.match(/DTSTART(?:;[^:\r\n]*)?:(\d{8})/);
    const stop = body.match(/DTEND(?:;[^:\r\n]*)?:(\d{8})/);
    const codeMatch = body.match(/\/details\/(HM[A-Z0-9]+)/i);
    if (!start || !stop || !codeMatch) continue;
    out[codeMatch[1].toUpperCase()] = {
      ankunft: yyyymmddToGerman(start[1]),
      abreise: yyyymmddToGerman(stop[1]),
    };
  }
  return out;
}

function yyyymmddToGerman(s: string): string {
  return `${s.slice(6, 8)}.${s.slice(4, 6)}.${s.slice(0, 4)}`;
}

async function getAirbnbLookup(env: Env): Promise<Record<string, AirbnbStay>> {
  if (env.HOKO_KV) {
    const cached = await env.HOKO_KV.get(AIRBNB_CACHE_KEY, "json");
    if (cached) return cached as Record<string, AirbnbStay>;
  }
  const resp = await fetch(env.AIRBNB_ICAL_URL!, { cf: { cacheTtl: 60 } });
  if (!resp.ok) throw new Error(`Airbnb iCal HTTP ${resp.status}`);
  const parsed = parseAirbnbIcal(await resp.text());
  if (env.HOKO_KV) {
    await env.HOKO_KV.put(AIRBNB_CACHE_KEY, JSON.stringify(parsed), {
      expirationTtl: AIRBNB_CACHE_TTL,
    });
  }
  return parsed;
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
  lines.push(
    "",
    `Attached: meldeschein-${stay.code}.xls — upload directly to the Hotelkontrolle portal (Meldescheine importieren).`,
  );
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
<p style="color:#6b7480;font-size:13px">Attached: <code>meldeschein-${escapeHtml(stay.code)}.xls</code> — upload directly to the Hotelkontrolle portal's <em>Meldescheine importieren</em> page.</p>
</body></html>`;
}

// Real binary .xls (OLE2/BIFF8) — the hotelkontrolle.zh.ch portal's importer
// is Apache POI HSSF and is strict about structure: it expects the official
// ImportFormular template (sheet name "HoKo", 12 columns including the typo
// "Staatsanghörigkeit ISO" in column I, hidden CodeTable lookup sheet, named
// ranges, etc.). Instead of building from scratch, we start from the embedded
// template and only mutate the data rows.
//
// Birth-date columns are left blank (the guest form does not collect them).
// Staatsangehörigkeit (column H) is set to the German country name resolved
// from the template's CodeTable via the guest's ISO code, falling back to the
// guest-typed country name so we never write null.

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

let cachedIsoToGerman: Record<string, string> | null = null;

function buildIsoToGermanMap(wb: XLSX.WorkBook): Record<string, string> {
  if (cachedIsoToGerman) return cachedIsoToGerman;
  const sheet = wb.Sheets["CodeTable"];
  const map: Record<string, string> = {};
  if (sheet && sheet["!ref"]) {
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    for (let r = 1; r <= range.e.r; r++) {
      const nameCell = sheet[XLSX.utils.encode_cell({ c: 0, r })];
      const isoCell = sheet[XLSX.utils.encode_cell({ c: 1, r })];
      const name = nameCell && nameCell.v != null ? String(nameCell.v) : "";
      const iso = isoCell && isoCell.v != null ? String(isoCell.v).toUpperCase() : "";
      if (name && /^[A-Z]{2}$/.test(iso)) map[iso] = name;
    }
  }
  cachedIsoToGerman = map;
  return map;
}

function buildMeldescheinXlsBase64(stay: StoredStay): string {
  const wb = XLSX.read(base64ToBytes(TEMPLATE_XLT_BASE64), { type: "array" });
  const isoToGerman = buildIsoToGermanMap(wb);

  const src = wb.Sheets["HoKo"];
  if (!src) throw new Error("HoKo sheet missing from template");

  // Start a fresh sheet keeping only the row-1 headers + sheet-level metadata
  // (column widths, merges, etc.). Drops the 500+ pre-numbered placeholder
  // rows so the portal stops at our data.
  const sheet: XLSX.WorkSheet = {};
  for (const key of Object.keys(src)) {
    if (key.startsWith("!")) {
      (sheet as Record<string, unknown>)[key] = (src as Record<string, unknown>)[key];
    } else if (XLSX.utils.decode_cell(key).r === 0) {
      (sheet as Record<string, unknown>)[key] = (src as Record<string, unknown>)[key];
    }
  }

  const setStr = (c: number, r: number, v: string) => {
    (sheet as Record<string, XLSX.CellObject>)[XLSX.utils.encode_cell({ c, r })] = { t: "s", v };
  };
  const setNum = (c: number, r: number, v: number) => {
    (sheet as Record<string, XLSX.CellObject>)[XLSX.utils.encode_cell({ c, r })] = { t: "n", v };
  };
  const setDate = (c: number, r: number, german: string) => {
    const m = german.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return;
    const serial = Math.round(
      (Date.UTC(+m[3], +m[2] - 1, +m[1]) - Date.UTC(1899, 11, 30)) / 86400000,
    );
    (sheet as Record<string, XLSX.CellObject>)[XLSX.utils.encode_cell({ c, r })] = {
      t: "n",
      v: serial,
      z: "dd.mm.yyyy",
    };
  };

  stay.guests.forEach((g, i) => {
    const r = i + 1; // row 0 holds headers
    const iso = (g.countryIso || "").toUpperCase();
    const country = isoToGerman[iso] || g.country;
    setNum(0, r, i + 1);            // A Meldeschein Nr.
    setStr(1, r, "Studio");         // B Zimmernummer
    setStr(2, r, g.lastname);       // C Familienname
    setStr(3, r, g.firstname);      // D Vornamen
    // E/F/G Geboren Tag/Monat/Jahr — left empty (guest form doesn't ask)
    setStr(7, r, country);          // H Staatsangehörigkeit
    if (iso) setStr(8, r, iso);     // I Staatsanghörigkeit ISO (template typo preserved)
    setStr(9, r, g.ausweisnummer);  // J Ausweisnummer
    setDate(10, r, stay.ankunft);   // K Ankunft  — real date cell, not string
    setDate(11, r, stay.abreise);   // L Abreise — real date cell, not string
  });

  sheet["!ref"] = `A1:L${stay.guests.length + 1}`;
  wb.Sheets["HoKo"] = sheet;

  return XLSX.write(wb, { bookType: "biff8", type: "base64" }) as string;
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
    attachments: [
      {
        filename: `meldeschein-${stay.code}.xls`,
        content: buildMeldescheinXlsBase64(stay),
        content_type: "application/vnd.ms-excel",
      },
    ],
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

// ===========================================================================
// 7-Minute Workout — reminder push subscriptions + cron delivery
// ===========================================================================
//
// We use *payload-less* Web Push: the only thing stored per subscription is the
// endpoint + when to remind. A Cron Trigger (wrangler.jsonc → triggers.crons)
// runs every 15 min and POSTs an empty, VAPID-signed push to each subscription
// whose local reminder time falls in the current window; the app's service
// worker renders a fixed reminder. No aes128gcm payload encryption needed —
// only the VAPID JWT (ES256) is signed here via Web Crypto.
//
// One-time setup:
//   npx web-push generate-vapid-keys          # → public + private (base64url)
//   npx wrangler kv namespace create WORKOUT_KV   # → id into wrangler.jsonc
//   npx wrangler secret put VAPID_PUBLIC_KEY
//   npx wrangler secret put VAPID_PRIVATE_KEY
//   npx wrangler secret put VAPID_SUBJECT      # e.g. "mailto:you@zillessen.dev"
// The public key is also exposed to the frontend via build.sh → config.js.

const WORKOUT_SUB_PREFIX = "sub:";
const WORKOUT_MAX_BYTES = 4_000;
const REMINDER_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface WorkoutSub {
  endpoint: string;
  reminderTime: string; // "HH:MM" local
  tz: string; // IANA timezone
  lastSentDate: string; // "YYYY-MM-DD" local, "" if never
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isHttpsPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  try {
    return new URL(endpoint).protocol === "https:";
  } catch {
    return false;
  }
}

async function handleWorkoutApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders(), "Access-Control-Max-Age": "86400" } });
  }

  if (!env.WORKOUT_KV) {
    return jsonResponse(
      {
        error:
          "WORKOUT_KV not bound. Run `npx wrangler kv namespace create WORKOUT_KV` and set the id in wrangler.jsonc.",
      },
      503,
    );
  }

  // POST /api/workout/subscribe — create/update a reminder subscription.
  if (request.method === "POST" && url.pathname === `${WORKOUT_API_PREFIX}/subscribe`) {
    const text = await request.text();
    if (text.length === 0 || text.length > WORKOUT_MAX_BYTES) {
      return jsonResponse({ error: "Invalid body size" }, 400);
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    if (!isHttpsPushEndpoint(body.endpoint)) {
      return jsonResponse({ error: "Invalid endpoint" }, 400);
    }
    const reminderTime = typeof body.reminderTime === "string" ? body.reminderTime : "";
    if (!REMINDER_TIME_REGEX.test(reminderTime)) {
      return jsonResponse({ error: "Invalid reminderTime (expected HH:MM)" }, 400);
    }
    const tz = sanitiseStr(body.tz, 64) || "UTC";

    const key = WORKOUT_SUB_PREFIX + (await sha256Hex(body.endpoint));
    // Preserve lastSentDate if the subscription already exists (settings update).
    const existing = await env.WORKOUT_KV.get<WorkoutSub>(key, "json");
    const sub: WorkoutSub = {
      endpoint: body.endpoint,
      reminderTime,
      tz,
      lastSentDate: existing?.lastSentDate ?? "",
    };
    await env.WORKOUT_KV.put(key, JSON.stringify(sub));
    return jsonResponse({ ok: true }, 201);
  }

  // DELETE /api/workout/subscribe — drop a subscription.
  if (request.method === "DELETE" && url.pathname === `${WORKOUT_API_PREFIX}/subscribe`) {
    const text = await request.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    if (!isHttpsPushEndpoint(body.endpoint)) {
      return jsonResponse({ error: "Invalid endpoint" }, 400);
    }
    await env.WORKOUT_KV.delete(WORKOUT_SUB_PREFIX + (await sha256Hex(body.endpoint)));
    return jsonResponse({ ok: true }, 200);
  }

  // POST /api/workout/test — send a reminder to an already-subscribed endpoint
  // immediately (used for manual verification). The endpoint must exist in KV.
  if (request.method === "POST" && url.pathname === `${WORKOUT_API_PREFIX}/test`) {
    const text = await request.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    if (!isHttpsPushEndpoint(body.endpoint)) {
      return jsonResponse({ error: "Invalid endpoint" }, 400);
    }
    const key = WORKOUT_SUB_PREFIX + (await sha256Hex(body.endpoint));
    if ((await env.WORKOUT_KV.get(key)) === null) {
      return jsonResponse({ error: "Unknown subscription" }, 404);
    }
    const signer = await getVapidSigner(env);
    if (!signer) return jsonResponse({ error: "VAPID not configured" }, 503);
    const status = await sendWorkoutPush(body.endpoint, signer, env.VAPID_PUBLIC_KEY!);
    if (status === 404 || status === 410) await env.WORKOUT_KV.delete(key);
    return jsonResponse({ pushStatus: status }, status < 400 ? 200 : 502);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}

// ---------------------------------------------------------------------------
// VAPID / Web Push (payload-less) via Web Crypto
// ---------------------------------------------------------------------------

interface VapidSigner {
  key: CryptoKey;
  subject: string;
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getVapidSigner(env: Env): Promise<VapidSigner | null> {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) return null;
  const d = b64urlDecode(env.VAPID_PRIVATE_KEY); // 32-byte raw private scalar
  const pub = b64urlDecode(env.VAPID_PUBLIC_KEY); // 65-byte uncompressed point
  if (pub.length !== 65 || pub[0] !== 0x04) return null;
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: b64urlEncode(d),
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    ext: true,
  };
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return { key, subject: env.VAPID_SUBJECT };
}

async function signVapidJwt(audience: string, signer: VapidSigner): Promise<string> {
  const enc = new TextEncoder();
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // ≤24h per spec
  const payload = b64urlEncode(
    enc.encode(JSON.stringify({ aud: audience, exp, sub: signer.subject })),
  );
  const signingInput = `${header}.${payload}`;
  // Web Crypto ECDSA produces the raw r||s signature that JWS ES256 expects.
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signer.key,
    enc.encode(signingInput),
  );
  return `${signingInput}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** POST a payload-less push to the endpoint. Returns the HTTP status. */
async function sendWorkoutPush(
  endpoint: string,
  signer: VapidSigner,
  publicKey: string,
): Promise<number> {
  const aud = new URL(endpoint).origin;
  const jwt = await signVapidJwt(aud, signer);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${publicKey}`,
        TTL: "86400",
        Urgency: "normal",
      },
    });
    return res.status;
  } catch (err) {
    console.error("push send failed", err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Cron delivery
// ---------------------------------------------------------------------------

/** Local "YYYY-MM-DD" + minutes-since-midnight for a tz, defaulting to UTC. */
function localTimeInZone(tz: string, now: Date): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  let hh = parseInt(get("hour"), 10);
  if (hh === 24) hh = 0; // some engines emit 24 at midnight
  const mm = parseInt(get("minute"), 10);
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: hh * 60 + mm };
}

async function sendDueWorkoutReminders(env: Env): Promise<void> {
  if (!env.WORKOUT_KV) return;
  const signer = await getVapidSigner(env);
  if (!signer) {
    console.warn("VAPID not configured — skipping workout reminders");
    return;
  }
  const now = new Date();
  let cursor: string | undefined;
  do {
    const page = await env.WORKOUT_KV.list({ prefix: WORKOUT_SUB_PREFIX, cursor });
    for (const k of page.keys) {
      const sub = await env.WORKOUT_KV.get<WorkoutSub>(k.name, "json");
      if (!sub) continue;
      const { date, minutes } = localTimeInZone(sub.tz, now);
      const [th, tm] = sub.reminderTime.split(":").map((n) => parseInt(n, 10));
      const target = th * 60 + tm;
      const windowStart = Math.floor(minutes / 15) * 15;
      const due = target >= windowStart && target < windowStart + 15;
      if (!due || sub.lastSentDate === date) continue;

      const status = await sendWorkoutPush(sub.endpoint, signer, env.VAPID_PUBLIC_KEY!);
      if (status === 404 || status === 410) {
        await env.WORKOUT_KV.delete(k.name); // prune dead subscription
      } else if (status >= 200 && status < 300) {
        await env.WORKOUT_KV.put(k.name, JSON.stringify({ ...sub, lastSentDate: date }));
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}
