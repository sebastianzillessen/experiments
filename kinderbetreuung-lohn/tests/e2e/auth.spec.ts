import { test, expect } from '@playwright/test';
import { uniqueEmail } from '../helpers/ids';
import { createConfirmedUser, magicLinkFor, magicLinkFromInbucket } from '../helpers/auth';

test.describe('Auth', () => {
  test('full magic-link flow via Inbucket', async ({ page }) => {
    const email = uniqueEmail('inbucket');
    await createConfirmedUser(email);

    await page.goto('/');
    await expect(page.locator('#login-screen')).toBeVisible();

    await page.locator('#login-email').fill(email);
    await page.locator('#btn-magic-link').click();

    // App shows a success message once signInWithOtp resolved.
    await expect(page.locator('#auth-info')).toBeVisible({ timeout: 10_000 });

    const link = await magicLinkFromInbucket(email);
    await page.goto(link);

    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#login-screen')).toBeHidden();
  });

  test('admin generateLink shortcut signs the user in', async ({ page }) => {
    const email = uniqueEmail('admin-link');
    await createConfirmedUser(email);

    const link = await magicLinkFor(email);
    await page.goto(link);

    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#login-screen')).toBeHidden();
  });

  test('logout returns to login screen', async ({ page }) => {
    const email = uniqueEmail('logout');
    await createConfirmedUser(email);
    const link = await magicLinkFor(email);
    await page.goto(link);
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });

    await page.locator('#btn-signout').click();

    await expect(page.locator('#login-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#user-strip')).toBeHidden();
  });
});
