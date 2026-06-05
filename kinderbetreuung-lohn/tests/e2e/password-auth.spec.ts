import { test as base, expect } from '@playwright/test';
import { test as authedTest } from '../fixtures';
import { uniqueEmail } from '../helpers/ids';
import { createConfirmedUser, magicLinkFromInbucket } from '../helpers/auth';

const test = base;

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

  test('forgot-password flow: recovery mail, set new password, sign in with it', async ({ page }) => {
    const email = uniqueEmail('pw-reset');
    const newPassword = 'mein-neues-passwort-1';
    await createConfirmedUser(email); // magic-link-only user, no password yet

    await page.goto('/');
    await page.locator('#login-email').fill(email);
    await page.locator('#btn-forgot-password').click();
    await expect(page.locator('#auth-info')).toBeVisible({ timeout: 10_000 });

    // Follow the recovery link from the mailcatcher → PASSWORD_RECOVERY event
    // → set-password overlay.
    const link = await magicLinkFromInbucket(email);
    await page.goto(link);
    await expect(page.locator('#set-password-screen')).toBeVisible({ timeout: 10_000 });

    await page.locator('#new-password').fill(newPassword);
    await page.locator('#new-password-confirm').fill(newPassword);
    await page.locator('#btn-set-password').click();
    await expect(page.locator('#set-password-screen')).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });

    // Sign out and back in with the new password.
    await page.locator('#btn-signout').click();
    await expect(page.locator('#login-screen')).toBeVisible({ timeout: 10_000 });
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(newPassword);
    await page.locator('#btn-password-signin').click();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
  });
});

authedTest('signed-in user can set a password on the Einstellungen tab', async ({ signedInUser }) => {
  const { page, email } = signedInUser;
  const newPassword = 'konto-passwort-123';

  await page.locator('#tab-einstellungen').click();
  await page.locator('#account-new-password').fill(newPassword);
  await page.locator('#btn-change-password').click();
  await expect(page.locator('#account-password-msg')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#account-password-msg')).toContainText('Passwort aktualisiert');

  await page.locator('#btn-signout').click();
  await expect(page.locator('#login-screen')).toBeVisible({ timeout: 10_000 });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(newPassword);
  await page.locator('#btn-password-signin').click();
  await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
});
