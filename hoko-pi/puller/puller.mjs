// hoko-puller — every POLL_INTERVAL_SEC, ask the worker for submissions
// newer than the last-seen timestamp, download each as .xls, and drop it into
// /upload (the volume the DTS daemon watches).
//
// State lives in /state/last-seen.json so we don't re-download on restart.
// On first run (no state file) we start from "now" so historical entries
// aren't re-uploaded — change `START_BACKFILL_DAYS` below if you want to
// backfill instead.

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

const API = required("HOKO_API");
const TOKEN = required("HOKO_PULLER_TOKEN");
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/upload";
const STATE_DIR = process.env.STATE_DIR || "/state";
const POLL_INTERVAL_MS = (Number(process.env.POLL_INTERVAL_SEC) || 3600) * 1000;
const START_BACKFILL_DAYS = Number(process.env.START_BACKFILL_DAYS) || 0;

const STATE_FILE = join(STATE_DIR, "last-seen.json");

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

function ts() {
  return new Date().toISOString();
}

async function loadState() {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const obj = JSON.parse(raw);
    if (typeof obj.lastSeenMs === "number") return obj;
  } catch {
    /* first run */
  }
  const startMs = Date.now() - START_BACKFILL_DAYS * 86400_000;
  return { lastSeenMs: startMs, processed: [] };
}

async function saveState(state) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchPending(sinceMs) {
  const resp = await fetch(`${API}/api/hoko/list?since=${sinceMs}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  if (!resp.ok) throw new Error(`list HTTP ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function downloadXls(code) {
  const resp = await fetch(`${API}/api/hoko/${encodeURIComponent(code)}.xls`);
  if (!resp.ok) throw new Error(`xls ${code} HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

async function alreadyOnDisk(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function tick(state) {
  let pending;
  try {
    pending = await fetchPending(state.lastSeenMs);
  } catch (err) {
    console.error(`[${ts()}] poll failed: ${err.message}`);
    return state;
  }
  if (pending.length === 0) {
    console.log(`[${ts()}] no new submissions (since ${new Date(state.lastSeenMs).toISOString()})`);
    return state;
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  let nextMs = state.lastSeenMs;
  const processed = new Set(state.processed || []);
  for (const { code, submittedAt } of pending) {
    if (processed.has(code)) continue;
    const path = join(UPLOAD_DIR, `meldeschein-${code}.xls`);
    if (await alreadyOnDisk(path)) {
      console.log(`[${ts()}] ${code} already in upload dir, skipping`);
      processed.add(code);
      continue;
    }
    try {
      const bytes = await downloadXls(code);
      await writeFile(path, bytes);
      console.log(`[${ts()}] dropped ${path} (${bytes.length} bytes, submittedAt=${submittedAt})`);
      processed.add(code);
      const submittedMs = Date.parse(submittedAt);
      if (submittedMs > nextMs) nextMs = submittedMs;
    } catch (err) {
      console.error(`[${ts()}] download ${code} failed: ${err.message}`);
    }
  }
  // Keep the processed set bounded — only retain the most recent 500 codes.
  const processedTrimmed = [...processed].slice(-500);
  const newState = { lastSeenMs: nextMs, processed: processedTrimmed };
  await saveState(newState);
  return newState;
}

let state = await loadState();
console.log(`[${ts()}] hoko-puller started`);
console.log(`  api:           ${API}`);
console.log(`  upload dir:    ${UPLOAD_DIR}`);
console.log(`  interval:      ${POLL_INTERVAL_MS / 1000}s`);
console.log(`  last-seen:     ${new Date(state.lastSeenMs).toISOString()}`);

while (true) {
  state = await tick(state);
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
}
