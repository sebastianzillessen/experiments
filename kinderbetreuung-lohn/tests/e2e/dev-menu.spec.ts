import { test, expect } from '../fixtures';
import { createConfirmedUser, magicLinkFor } from '../helpers/auth';
import { uniqueEmail } from '../helpers/ids';

test.describe('Developer menu (preview only)', () => {
  test('lets you force-show the tutorials on an existing account', async ({ signedInUser }) => {
    const { page } = signedInUser;

    // Served on localhost → preview environment → the dev menu is available.
    const toggle = page.locator('.dev-menu-toggle');
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    // Dismiss the regular onboarding assistant so it is out of the way.
    const banner = page.locator('.onboarding-wrap');
    await expect(banner).toBeVisible();
    await banner.locator('.onboarding-dismiss').click();
    await expect(banner).toHaveCount(0);

    // Open the dev menu and force the admin assistant back on — even though it
    // was dismissed. It now shows the "Developer-Vorschau" badge instead of the
    // dismiss button.
    await toggle.click();
    await page.getByText('Onboarding-Assistent (Admin) erzwingen').click();
    await expect(banner).toBeVisible();
    await expect(banner.locator('.onboarding-preview-badge')).toBeVisible();

    // Force the employee tutorial on — it appears on the (already active)
    // Stundenerfassung tab even though this account is an owner.
    await page.getByText('Mitarbeiter-Tutorial erzwingen', { exact: false }).click();
    const tutorial = page.locator('[aria-label="Tutorial Stundenerfassung"]');
    await expect(tutorial).toBeVisible();
    await expect(tutorial.locator('.onboarding-preview-badge')).toBeVisible();
  });

  test('is hidden on production', async ({ page }) => {
    const email = uniqueEmail('prod');
    await createConfirmedUser(email);

    // Pin the environment to production before any app script runs.
    await page.addInitScript(() => {
      (window as Window & { __SALAERLI_FORCE_PREVIEW?: boolean }).__SALAERLI_FORCE_PREVIEW = false;
    });
    await page.goto(await magicLinkFor(email));
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('.dev-menu-toggle')).toHaveCount(0);
  });
});
