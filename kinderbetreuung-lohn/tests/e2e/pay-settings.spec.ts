import { test, expect } from '../fixtures';
import { adminClient } from '../helpers/supabase';

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function firstOfMonth(yyyymm: string): string {
  return `${yyyymm}-01`;
}

test.describe('Pay settings versions', () => {
  test('owner can create the first version via UI', async ({ signedInUser }) => {
    const { page, householdId } = signedInUser;

    await page.locator('#tab-einstellungen').click();
    await expect(page.locator('#pay-settings-list')).toContainText(/Lade|Noch keine|leere/i, { timeout: 5_000 });

    await page.locator('#btn-add-pay-settings').click();
    await page.locator('#ps-month').fill(thisMonth());
    // The hourly wage is per-employee now; the household-wide version carries the
    // statutory/cantonal rates. Use the holiday allowance as the distinctive field.
    await page.locator('#ps-holiday-percent').fill('4.00');
    await page.locator('#btn-save-pay-settings').click();

    await expect.poll(async () => {
      const { data } = await adminClient()
        .from('pay_settings')
        .select('id, effective_month, data')
        .eq('household_id', householdId);
      return data?.length ?? 0;
    }, { timeout: 8_000 }).toBe(1);

    const { data } = await adminClient()
      .from('pay_settings')
      .select('effective_month, data')
      .eq('household_id', householdId)
      .single();
    expect(data?.effective_month).toBe(firstOfMonth(thisMonth()));
    expect(Number(data?.data?.holidayPercent)).toBe(4);
  });

  test('existing shift locks the corresponding pay-settings version', async ({ signedInUser }) => {
    const { householdId, userId, page } = signedInUser;
    const month = thisMonth();

    // Seed pay-settings + one shift directly so the lock branch is exercised.
    const { error: psErr } = await adminClient()
      .from('pay_settings')
      .insert({
        household_id: householdId,
        effective_month: firstOfMonth(month),
        data: {
          holidayPercent: 3.59,
          ahvIvEoEmployee: 5.3, ahvIvEoEmployer: 5.3,
          alvEmployee: 1.1, alvEmployer: 1.1,
          fakEmployer: 1.025, withholdingTax: 5,
          adminFeeEmployer: 5,
          uvgEnabled: true, uvgBuEmployer: 0.505, uvgNbuEmployee: 1.432
        }
      })
      .select()
      .single();
    expect(psErr).toBeNull();

    const { error: shiftErr } = await adminClient()
      .from('shifts')
      .insert({
        household_id: householdId,
        date: `${month}-15`,
        hours: 4,
        note: 'lock-trigger',
        entered_by: userId
      });
    expect(shiftErr).toBeNull();

    // Seeds happen after page load, so the app's cached state is empty until reload.
    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
    await page.locator('#tab-einstellungen').click();

    // The list shows a lock indicator once a shift falls into the version's period.
    await expect(page.locator('#pay-settings-list')).toContainText(/gesperrt/i, { timeout: 8_000 });

    // Open the edit form for the seeded version.
    await page.locator('#pay-settings-list button[data-edit-ps]').first().click();

    await expect(page.locator('#ps-locked-warn')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#ps-holiday-percent')).toBeDisabled();
  });
});
