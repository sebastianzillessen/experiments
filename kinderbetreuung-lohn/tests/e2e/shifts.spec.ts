import { test, expect } from '../fixtures';
import { adminClient } from '../helpers/supabase';

const DEFAULT_PS_DATA = {
  hourlyRate: 30, vacationPercent: 8.33,
  ahvIvEoEmployee: 5.3, ahvIvEoEmployer: 5.3,
  alvEmployee: 1.1, alvEmployer: 1.1,
  fakEmployer: 1, withholdingTax: 5,
  adminFeeEmployer: 0.4,
  uvgEnabled: true, uvgBuEmployer: 0.505, uvgNbuEmployee: 1.47
};

async function seedPaySettings(householdId: string, month: string, hourlyRate: number) {
  const { error } = await adminClient()
    .from('pay_settings')
    .insert({
      household_id: householdId,
      effective_month: `${month}-01`,
      data: { ...DEFAULT_PS_DATA, hourlyRate }
    });
  if (error) throw error;
}

test.describe('Shifts', () => {
  test('user can add a shift and sees it in the entries list', async ({ signedInUser }) => {
    const { page, householdId } = signedInUser;
    const month = new Date().toISOString().slice(0, 7);
    await seedPaySettings(householdId, month, 35);

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });

    await page.locator('#e-datum').fill(`${month}-10`);
    await page.locator('#e-stunden').fill('4');
    await page.locator('#e-notiz').fill('Test-Einsatz');
    await page.locator('#btn-add').click();

    await expect(page.locator('#entries-list')).toContainText('Test-Einsatz', { timeout: 8_000 });
    await expect(page.locator('#entries-list')).toContainText('35');

    const { data } = await adminClient()
      .from('shifts')
      .select('hours, note')
      .eq('household_id', householdId);
    expect(data?.length).toBe(1);
    expect(Number(data?.[0].hours)).toBe(4);
  });

  test('pay-rate raise: two versions yield different hourly rates per month', async ({ signedInUser }) => {
    const { page, householdId, userId } = signedInUser;
    const now = new Date();
    const earlierMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const laterDate = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString().slice(0, 10);
    const laterMonth = laterDate.slice(0, 7);

    await seedPaySettings(householdId, earlierMonth, 30);
    await seedPaySettings(householdId, laterMonth, 40);

    // Shifts in both months
    await adminClient().from('shifts').insert([
      { household_id: householdId, date: `${earlierMonth}-05`, hours: 2, entered_by: userId, note: 'old-rate' },
      { household_id: householdId, date: `${laterMonth}-05`,   hours: 2, entered_by: userId, note: 'new-rate' }
    ]);

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });

    const entries = page.locator('#entries-list');
    await expect(entries).toContainText('old-rate', { timeout: 8_000 });
    await expect(entries).toContainText('new-rate');
    await expect(entries).toContainText('30');
    await expect(entries).toContainText('40');
  });
});
