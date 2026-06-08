import { test, expect } from '../fixtures';
import { adminClient } from '../helpers/supabase';
import { uniqueEmail } from '../helpers/ids';
import { createConfirmedUser, magicLinkFor } from '../helpers/auth';

const DEFAULT_PS_DATA = {
  holidayPercent: 3.59,
  ahvIvEoEmployee: 5.3, ahvIvEoEmployer: 5.3,
  alvEmployee: 1.1, alvEmployer: 1.1,
  fakEmployer: 1.025, withholdingTax: 5,
  adminFeeEmployer: 5,
  uvgEnabled: true, uvgBuEmployer: 0.505, uvgNbuEmployee: 1.432
};

test.describe('Onboarding tutorial', () => {
  test('a fresh owner sees the 3-step setup assistant and can dismiss it', async ({ signedInUser }) => {
    const { page } = signedInUser;
    const banner = page.locator('.onboarding-wrap');

    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText('Stammdaten erfassen');
    await expect(banner).toContainText('Beitragssätze festlegen');
    await expect(banner).toContainText('Mitarbeitende anlegen');

    // The first incomplete step offers a CTA into the matching tab.
    await page.locator('[data-onboarding-go="stammdaten"]').click();
    await expect(page.locator('#stammdaten')).toHaveClass(/active/);

    // Dismissing removes the assistant entirely and it stays gone after reload.
    await banner.locator('.onboarding-dismiss').click();
    await expect(banner).toHaveCount(0);

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.onboarding-wrap')).toHaveCount(0);
  });

  test('the assistant disappears once household setup is complete', async ({ signedInUser }) => {
    const { page, householdId } = signedInUser;
    const admin = adminClient();

    await expect(page.locator('.onboarding-wrap')).toBeVisible({ timeout: 10_000 });

    // Complete all three steps: employer master data, a pay-settings version and an employee.
    const { error: profErr } = await admin.from('household_profile').upsert({
      household_id: householdId,
      employer: { name: 'Familie Muster', address: 'Bahnhofstrasse 1', zip: '8001', city: 'Zürich', country: 'CH', canton: 'ZH', billingNumber: '' },
      updated_at: new Date().toISOString()
    });
    expect(profErr).toBeNull();

    const month = new Date().toISOString().slice(0, 7);
    const { error: psErr } = await admin.from('pay_settings').insert({
      household_id: householdId, effective_month: `${month}-01`, data: DEFAULT_PS_DATA
    });
    expect(psErr).toBeNull();

    const { error: empErr } = await admin.from('employees').insert({
      household_id: householdId, data: { name: 'Erika Beispiel' }
    });
    expect(empErr).toBeNull();

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.onboarding-wrap')).toHaveCount(0);
  });

  test('a freshly joined employee gets the shift-entry tutorial', async ({ signedInUser, browser }) => {
    const { householdId, userId } = signedInUser;
    const memberEmail = uniqueEmail('member');

    // Pending invite must exist before the member is created so they join this
    // household instead of getting an auto-household.
    const { error: invErr } = await adminClient().from('invites').insert({
      household_id: householdId, email: memberEmail, role: 'employee', invited_by: userId
    });
    expect(invErr).toBeNull();
    await createConfirmedUser(memberEmail);

    const ctx = await browser.newContext();
    const memberPage = await ctx.newPage();
    await memberPage.goto(await magicLinkFor(memberEmail));

    await expect(memberPage.locator('#invite-banner')).toBeVisible({ timeout: 10_000 });
    await memberPage.locator('#btn-accept-invite').click();

    // After joining, the Stundenerfassung tab shows the how-to tutorial.
    const tutorial = memberPage.locator('[aria-label="Tutorial Stundenerfassung"]');
    await expect(tutorial).toBeVisible({ timeout: 10_000 });
    await expect(tutorial).toContainText('So erfasst du deine Stunden');

    // It is dismissible and stays gone afterwards.
    await tutorial.getByRole('button', { name: 'Verstanden' }).click();
    await expect(tutorial).toHaveCount(0);

    await ctx.close();
  });
});
