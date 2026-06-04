import { test, expect } from '../fixtures';
import { adminClient } from '../helpers/supabase';

test.describe('Household bootstrap', () => {
  test('fresh user gets an auto-household with owner role', async ({ signedInUser }) => {
    const { userId, householdId } = signedInUser;

    const { data: membership, error } = await adminClient()
      .from('memberships')
      .select('role, household_id')
      .eq('user_id', userId)
      .single();

    expect(error).toBeNull();
    expect(membership?.role).toBe('owner');
    expect(membership?.household_id).toBe(householdId);
  });

  test('Employer Stammdaten persist across reload', async ({ signedInUser }) => {
    const { page, householdId } = signedInUser;

    await page.locator('#tab-stammdaten').click();
    await page.locator('#ag-name').fill('Familie Test');
    await page.locator('#ag-adresse').fill('Bahnhofstrasse 1, 8001 Zürich');

    // Trigger blur to fire the debounced save.
    await page.locator('#ag-adresse').blur();

    // Wait for the debounced (1 s) save + round-trip.
    await expect.poll(async () => {
      const { data } = await adminClient()
        .from('household_profile')
        .select('employer')
        .eq('household_id', householdId)
        .maybeSingle();
      return data?.employer?.name;
    }, { timeout: 8_000 }).toBe('Familie Test');

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
    await page.locator('#tab-stammdaten').click();

    await expect(page.locator('#ag-name')).toHaveValue('Familie Test');
    await expect(page.locator('#ag-adresse')).toHaveValue('Bahnhofstrasse 1, 8001 Zürich');
  });

  test('employee Stammdaten can be created on the Mitarbeitende tab', async ({ signedInUser }) => {
    const { page, householdId } = signedInUser;

    await page.locator('#tab-mitarbeitende').click();
    await page.locator('#mit-add').click();
    await page.locator('#emp-f-name').fill('Erika Beispiel');
    await page.locator('#emp-f-iban').fill('CH93 0076 2011 6238 5295 7');
    await page.locator('#emp-save').click();

    await expect.poll(async () => {
      const { data } = await adminClient()
        .from('employees')
        .select('data')
        .eq('household_id', householdId);
      return data?.[0]?.data?.name;
    }, { timeout: 8_000 }).toBe('Erika Beispiel');

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
    await page.locator('#tab-mitarbeitende').click();
    await expect(page.locator('#mitarbeitende-root')).toContainText('Erika Beispiel');
  });
});
