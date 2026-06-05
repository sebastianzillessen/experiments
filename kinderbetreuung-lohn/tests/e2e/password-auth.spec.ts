import { test, expect } from '@playwright/test';
import { uniqueEmail } from '../helpers/ids';
import { createConfirmedUser } from '../helpers/auth';

test.describe('Password auth', () => {
  test('sign-in with email and password', async ({ page }) => {
    const email = uniqueEmail('pw');
    const password = 'test-passwort-123';
    await createConfirmedUser(email, password);

    await page.goto('/');
    await expect(page.locator('#login-screen')).toBeVisible();

    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.locator('#btn-password-signin').click();

    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#login-screen')).toBeHidden();
  });

  test('wrong password shows an error and stays on the login screen', async ({ page }) => {
    const email = uniqueEmail('pw-wrong');
    await createConfirmedUser(email, 'richtiges-passwort-1');

    await page.goto('/');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill('falsches-passwort');
    await page.locator('#btn-password-signin').click();

    await expect(page.locator('#auth-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#auth-error')).toContainText('Anmeldung fehlgeschlagen');
    await expect(page.locator('#login-screen')).toBeVisible();
  });

  test('sign-up creates an account (confirmation mail or direct session)', async ({ page }) => {
    const email = uniqueEmail('pw-signup');
    const password = 'neues-passwort-123';

    await page.goto('/');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.locator('#btn-password-signup').click();

    // Local stack has e-mail confirmations enabled for signups via mailer —
    // either a session is created directly (#user-strip) or the info message
    // about the confirmation mail shows. Both are valid outcomes.
    await expect(page.locator('#user-strip:visible, #auth-info:visible')).toBeVisible({ timeout: 10_000 });
  });
});
