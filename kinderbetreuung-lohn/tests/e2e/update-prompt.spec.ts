import { test, expect } from '@playwright/test';

// build.sh stamps a real commit into config.js, so window.__APP_VERSION.commit is
// set in CI. We simulate a "new deploy" by intercepting config.js to report a
// different commit, then assert the refresh banner appears.
const NEW_VERSION_CONFIG =
  'window.__APP_CONFIG={url:"http://127.0.0.1:9",key:"anon-test-key"};' +
  'window.__APP_VERSION={commit:"deadbeef-new",builtAt:"2099-01-01T00:00:00Z"};';

test.describe('Update prompt', () => {
  test('shows a refresh banner when a newer version is deployed; "Später" dismisses it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#login-screen')).toBeVisible();
    // Fresh load: running version == deployed version → no banner.
    await expect(page.locator('#update-banner')).toHaveCount(0);

    // Simulate a new deploy for subsequent config.js fetches (the version check).
    await page.route('**/config.js*', route => route.fulfill({
      contentType: 'application/javascript', body: NEW_VERSION_CONFIG
    }));
    // The app re-checks the version when it regains focus.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    const banner = page.locator('#update-banner');
    await expect(banner).toBeVisible({ timeout: 8_000 });
    await expect(banner).toContainText('Neue Version verfügbar');

    // "Später" hides it and it does not nag again for the same version.
    await page.locator('#btn-update-later').click();
    await expect(banner).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(600);
    await expect(banner).toHaveCount(0);
  });

  test('"Aktualisieren" reloads the app', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#login-screen')).toBeVisible();

    await page.route('**/config.js*', route => route.fulfill({
      contentType: 'application/javascript', body: NEW_VERSION_CONFIG
    }));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('#update-banner')).toBeVisible({ timeout: 8_000 });

    // Clicking triggers a full reload. After it, the (now routed) config.js is
    // the running version, so the banner is gone.
    await Promise.all([
      page.waitForEvent('load'),
      page.locator('#btn-update-now').click()
    ]);
    await expect(page.locator('#login-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#update-banner')).toHaveCount(0);
  });
});
