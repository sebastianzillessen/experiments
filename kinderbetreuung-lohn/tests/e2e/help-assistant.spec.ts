import { test, expect } from '../fixtures';

// The send-help-message Edge Function is not served by the local test stack, so
// we intercept the network call (incl. the CORS preflight) and assert on the
// request the frontend makes + how it renders the response.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

test.describe('Help assistant', () => {
  test('sends a help message with context and confirms it was sent', async ({ signedInUser }) => {
    const { page, email } = signedInUser;

    let captured: { message?: string; context?: Record<string, unknown> } | null = null;
    await page.route('**/functions/v1/send-help-message', async route => {
      const req = route.request();
      if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return; }
      captured = req.postDataJSON();
      await route.fulfill({
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, reply: null })
      });
    });

    await page.locator('#help-toggle').click();
    await page.locator('#help-message').fill('Wie lege ich einen neuen Stundenlohn an?');
    await page.locator('#help-send').click();

    await expect(page.locator('.help-panel')).toContainText('gesendet', { timeout: 8_000 });
    await expect(page.locator('.help-panel')).toContainText(email);

    expect(captured).not.toBeNull();
    expect(captured!.message).toBe('Wie lege ich einen neuen Stundenlohn an?');
    // Context carries lightweight diagnostics (default tab is Stundenerfassung).
    expect(captured!.context).toMatchObject({ tab: 'Stundenerfassung', role: 'owner' });
  });

  test('renders an inline agent reply when the function returns one', async ({ signedInUser }) => {
    const { page } = signedInUser;

    await page.route('**/functions/v1/send-help-message', async route => {
      const req = route.request();
      if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return; }
      await route.fulfill({
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, reply: 'Unter „Mitarbeitende" → Person bearbeiten kannst du eine Lohn-Version anlegen.' })
      });
    });

    await page.locator('#help-toggle').click();
    await page.locator('#help-message').fill('Stundenlohn?');
    await page.locator('#help-send').click();

    await expect(page.locator('.help-panel')).toContainText('Lohn-Version anlegen', { timeout: 8_000 });
  });

  test('validates an empty message before calling the function', async ({ signedInUser }) => {
    const { page } = signedInUser;

    let called = false;
    await page.route('**/functions/v1/send-help-message', async route => {
      called = true;
      await route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: '{"ok":true}' });
    });

    await page.locator('#help-toggle').click();
    await page.locator('#help-send').click();
    await expect(page.locator('.help-panel')).toContainText('Bitte gib zuerst deine Frage ein');
    expect(called).toBe(false);
  });
});
