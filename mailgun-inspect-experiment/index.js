/**
 * Mailgun Inspect API Experiment
 *
 * Posts HTML email content and retrieves visual preview images
 * across two email clients.
 *
 * API docs: https://documentation.mailgun.com/docs/inspect/api-reference/openapi-final/email-preview
 */

import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import fetch from 'node-fetch';

const API_KEY = process.env.MAILGUN_API_KEY;
const BASE_URL = 'https://api.mailgun.net';

// Basic auth header: username is "api", password is the API key
const authHeader = 'Basic ' + Buffer.from(`api:${API_KEY}`).toString('base64');

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mailgun Inspect Test</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #e01b5a; color: #fff; padding: 32px 40px; }
    .header h1 { margin: 0; font-size: 28px; }
    .body { padding: 32px 40px; color: #333; line-height: 1.6; }
    .cta { display: inline-block; margin-top: 24px; padding: 14px 28px; background: #e01b5a; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold; }
    .footer { padding: 20px 40px; background: #f4f4f4; color: #999; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Hello from Mailgun Inspect!</h1>
    </div>
    <div class="body">
      <p>This is a test email generated to experiment with the <strong>Mailgun Inspect API</strong>.</p>
      <p>We are checking how this email renders across different clients and devices.</p>
      <ul>
        <li>Responsive layout</li>
        <li>Brand colour consistency</li>
        <li>Dark mode compatibility</li>
      </ul>
      <a href="https://example.com" class="cta">Click here to learn more</a>
    </div>
    <div class="footer">
      <p>You received this email because you signed up for our newsletter.</p>
      <p><a href="https://example.com/unsubscribe">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`;

// Selected clients based on SendGrid open stats for CH/DE user base
const CLIENTS = [
  'gmailcom-lm_chrcurrent_win10',    // Gmail webmail (Chrome) — #1 channel by far
  'android16_gmailapp_pixel10_lm',    // Android Gmail App — top mobile combo
  'iphone16_18',                      // iPhone Apple Mail — #2 mobile segment
  'applemail16',                      // Apple Mail desktop — top desktop client
  'm365_w11_lm_dt',                   // Outlook Microsoft 365 — Windows 11 (Word engine)
  'outlook2021_win11_lm_dt',          // Outlook 2021 — Windows 11 (Word engine)
  'o365_w10_lm_dt',                   // Outlook Office 365 — Windows 10 (Word engine)
  'outlook19',                        // Outlook 2019 — Windows 10 (Word engine)
  'outlook16_win10',                  // Outlook 2016 — Windows 10 (Word engine)
];

// ─── Step 1: Verify selected clients exist ────────────────────────────────────

async function verifyClients() {
  console.log('=== Step 1: Verifying selected clients ===');

  const res = await fetch(`${BASE_URL}/v1/preview/tests/clients`, {
    headers: { Authorization: authHeader },
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Failed to fetch clients:', res.status, data);
    throw new Error(`Fetch clients failed: ${res.status}`);
  }

  const available = data.clients;
  for (const id of CLIENTS) {
    const c = available[id];
    if (c) {
      console.log(`  OK: ${id} — ${c.client} | ${c.os} (${c.category})`);
    } else {
      console.warn(`  MISSING: ${id} — not found in available clients`);
    }
  }

  return CLIENTS.filter(id => available[id]);
}

// ─── Step 2: Create a preview test ───────────────────────────────────────────

async function createPreviewTest(clients) {
  console.log(`\n=== Step 2: Creating preview test with clients: ${clients.join(', ')} ===`);

  const body = {
    subject: 'Mailgun Inspect API Experiment',
    html: SAMPLE_HTML,
    clients,
  };

  const res = await fetch(`${BASE_URL}/v1/preview/tests`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Failed to create test:', res.status, data);
    throw new Error(`Create test failed: ${res.status}`);
  }

  console.log('Test created. ID:', data.id);
  console.log('Full response:', JSON.stringify(data, null, 2));
  return data.id;
}

// ─── Step 3: Poll until all clients have screenshots ─────────────────────────

async function pollForResults(testId, maxAttempts = 12, intervalMs = 5000) {
  console.log(`\n=== Step 3: Polling for results (test ID: ${testId}) ===`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`  Attempt ${attempt}/${maxAttempts}…`);

    const res = await fetch(`${BASE_URL}/v1/preview/tests/${testId}`, {
      headers: { Authorization: authHeader },
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Failed to fetch test:', res.status, data);
      throw new Error(`Fetch test failed: ${res.status}`);
    }

    const completed = data.completed ?? [];
    const processing = data.processing ?? [];

    console.log(`  Completed: ${completed.length}  |  Processing: ${processing.length}`);

    if (processing.length === 0) {
      console.log('\nAll clients processed.');
      return testId;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error('Timed out waiting for preview results');
}

// ─── Step 4: Fetch and print screenshot URLs ─────────────────────────────────

async function fetchAndPrintResults(testId) {
  console.log('\n=== Step 4: Screenshot URLs ===');

  const res = await fetch(`${BASE_URL}/v1/preview/tests/${testId}/results`, {
    headers: { Authorization: authHeader },
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Failed to fetch results:', res.status, data);
    throw new Error(`Fetch results failed: ${res.status}`);
  }

  const outDir = 'screenshots';
  await mkdir(outDir, { recursive: true });

  for (const [clientId, client] of Object.entries(data)) {
    const name = client.displayname ?? client.display_name ?? client.client;
    console.log(`\nClient: ${name} (${clientId})`);
    console.log(`  OS:         ${client.os}`);
    console.log(`  Category:   ${client.category}`);
    console.log(`  Status:     ${client.status}`);

    const url = client.screenshots?.default;
    if (url) {
      const imgRes = await fetch(url);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const path = `${outDir}/${clientId}.png`;
      await writeFile(path, buffer);
      console.log(`  Saved:      ${path}`);
    } else {
      console.log(`  Screenshot: N/A`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    const clients = await verifyClients();
    const testId = await createPreviewTest(clients);
    const completedTestId = await pollForResults(testId);
    await fetchAndPrintResults(completedTestId);
  } catch (err) {
    console.error('\nError:', err.message);
    process.exit(1);
  }
})();
