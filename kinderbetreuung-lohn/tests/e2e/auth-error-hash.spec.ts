import { test, expect } from '../fixtures';

const ERROR_HASH = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=';

// Regression tests for landing on the app with an auth error in the URL hash
// (e.g. a consumed or expired magic link).
test('stored session survives landing with an otp_expired error hash', async ({ signedInUser }) => {
  const { page } = signedInUser;

  await page.goto('/' + ERROR_HASH);

  await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#login-screen')).toBeHidden();
});

test('error hash without a session shows the login screen with an error message', async ({ page }) => {
  await page.goto('/' + ERROR_HASH);

  await expect(page.locator('#login-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#auth-error')).toBeVisible();
  await expect(page.locator('#auth-error')).toContainText('Anmelde-Link ungültig oder abgelaufen');
  // The stale error hash is stripped so a reload doesn't re-show it.
  expect(new URL(page.url()).hash).toBe('');
});
