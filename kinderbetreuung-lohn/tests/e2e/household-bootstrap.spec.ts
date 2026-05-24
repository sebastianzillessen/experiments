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

  test('Stammdaten persist across reload', async ({ signedInUser }) => {
    const { page, householdId } = signedInUser;

    await page.locator('#tab-stammdaten').click();
    await page.locator('#ag-name').fill('Familie Test');
    await page.locator('#ag-adresse').fill('Bahnhofstrasse 1, 8001 Zürich');
    await page.locator('#an-name').fill('Erika Beispiel');

    // Trigger blur to fire the debounced save.
    await page.locator('#an-name').blur();

    // Wait for the debounced (1 s) save + round-trip.
    await expect.poll(async () => {
      const { data } = await adminClient()
        .from('household_profile')
        .select('employer, employee')
        .eq('household_id', householdId)
        .maybeSingle();
      return data?.employer?.name;
    }, { timeout: 8_000 }).toBe('Familie Test');

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
    await page.locator('#tab-stammdaten').click();

    await expect(page.locator('#ag-name')).toHaveValue('Familie Test');
    await expect(page.locator('#ag-adresse')).toHaveValue('Bahnhofstrasse 1, 8001 Zürich');
    await expect(page.locator('#an-name')).toHaveValue('Erika Beispiel');
  });
});
