import { test, expect } from '../fixtures';

const ERROR_HASH = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=';

// Regression tests for landing on the app with an auth error in the URL hash
// (e.g. a consumed or expired magic link). Mirrors the vanilla bootstrap: an
// error hash always shows the login screen with a prominent warning and the
// stale hash is stripped from the URL.
test('error hash shows the login screen with a warning (even with a stored session)', async ({ signedInUser }) => {
  const { page } = signedInUser;

  // goto() with only a hash change does not reload the document — reload so
  // this behaves like a real navigation from the Supabase verify redirect.
  await page.goto('/' + ERROR_HASH);
  await page.reload();

  await expect(page.locator('#login-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#login-warning')).toBeVisible();
  await expect(page.locator('#login-warning')).toContainText('ungültig oder ist abgelaufen');
  expect(new URL(page.url()).hash).toBe('');
});

test('error hash without a session shows the login screen with a warning', async ({ page }) => {
  await page.goto('/' + ERROR_HASH);

  await expect(page.locator('#login-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#login-warning')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
});
