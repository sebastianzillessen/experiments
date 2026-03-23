/**
 * Mailgun Inspect API Experiment
 *
 * Posts HTML email content and retrieves visual preview images
 * across two email clients.
 *
 * API docs: https://documentation.mailgun.com/docs/inspect/api-reference/openapi-final/email-preview
 */

import 'dotenv/config';
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

// ─── Step 1: Fetch available clients ──────────────────────────────────────────

async function fetchClients() {
  console.log('=== Step 1: Fetching available clients ===');

  const res = await fetch(`${BASE_URL}/v1/preview/tests/clients`, {
    headers: { Authorization: authHeader },
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Failed to fetch clients:', res.status, data);
    throw new Error(`Fetch clients failed: ${res.status}`);
  }

  const clients = Object.values(data.clients);
  console.log(`Available clients (${clients.length}):`);
  for (const c of clients) {
    console.log(`  ${c.id} - ${c.client} | ${c.os} (${c.category})`);
  }

  return clients.slice(0, 2).map(c => c.id);
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

  for (const [clientId, client] of Object.entries(data)) {
    console.log(`\nClient: ${client.displayname} (${clientId})`);
    console.log(`  OS:         ${client.os}`);
    console.log(`  Category:   ${client.category}`);
    console.log(`  Status:     ${client.status}`);
    console.log(`  Screenshot: ${client.screenshots?.default ?? 'N/A'}`);
    console.log(`  Thumbnail:  ${client.thumbnail ?? 'N/A'}`);
    console.log(`  Full thumb: ${client.fullthumbnail ?? 'N/A'}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    const clients = await fetchClients();
    const testId = await createPreviewTest(clients);
    const completedTestId = await pollForResults(testId);
    await fetchAndPrintResults(completedTestId);
  } catch (err) {
    console.error('\nError:', err.message);
    process.exit(1);
  }
})();
