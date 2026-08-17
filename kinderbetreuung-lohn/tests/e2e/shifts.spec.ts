import { test, expect } from '../fixtures';
import { adminClient } from '../helpers/supabase';

const DEFAULT_PS_DATA = {
  holidayPercent: 3.59,
  ahvIvEoEmployee: 5.3, ahvIvEoEmployer: 5.3,
  alvEmployee: 1.1, alvEmployer: 1.1,
  fakEmployer: 1.025, withholdingTax: 5,
  adminFeeEmployer: 5,
  uvgEnabled: true, uvgBuEmployer: 0.505, uvgNbuEmployee: 1.432
};

async function seedPaySettings(householdId: string, month: string) {
  const { error } = await adminClient()
    .from('pay_settings')
    .insert({ household_id: householdId, effective_month: `${month}-01`, data: DEFAULT_PS_DATA });
  if (error) throw error;
}

async function seedEmployee(householdId: string, name = 'Erika Beispiel'): Promise<string> {
  const { data, error } = await adminClient()
    .from('employees')
    .insert({ household_id: householdId, data: { name } })
    .select('id')
    .single();
  if (error) throw error;
  return data!.id as string;
}

// The hourly wage is now per-employee and versioned (employee_wages). Seed it
// before any shifts of that period exist, or the period-lock trigger rejects it.
async function seedWage(employeeId: string, month: string, rate: number) {
  const { error } = await adminClient()
    .from('employee_wages')
    .insert({ employee_id: employeeId, effective_month: `${month}-01`, hourly_rate: rate });
  if (error) throw error;
}

test.describe('Shifts', () => {
  test('user can add a shift and sees it in the entries list', async ({ signedInUser }) => {
    const { page, householdId } = signedInUser;
    const month = new Date().toISOString().slice(0, 7);
    await seedPaySettings(householdId, month);
    const employeeId = await seedEmployee(householdId);
    await seedWage(employeeId, month, 35);

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });

    await page.locator('#e-datum').fill(`${month}-10`);
    await page.locator('#e-stunden').fill('4');
    await page.locator('#e-notiz').fill('Test-Einsatz');
    await page.locator('#btn-add').click();

    await expect(page.locator('#entries-list')).toContainText('Test-Einsatz', { timeout: 8_000 });
    await expect(page.locator('#entries-list')).toContainText('CHF 35.00');

    const { data } = await adminClient()
      .from('shifts')
      .select('hours, note, employee_id')
      .eq('household_id', householdId);
    expect(data?.length).toBe(1);
    expect(Number(data?.[0].hours)).toBe(4);
    // With a single employee the shift is attributed to them (explicitly or via trigger).
    expect(data?.[0].employee_id).toBe(employeeId);
  });

  test('Von/Bis auto-calculates the hours (note stays optional)', async ({ signedInUser }) => {
    const { page, householdId } = signedInUser;
    const month = new Date().toISOString().slice(0, 7);
    await seedPaySettings(householdId, month);
    const employeeId = await seedEmployee(householdId);
    await seedWage(employeeId, month, 30);

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });

    // Enter start/end instead of hours; leave the note empty.
    await page.locator('#e-datum').fill(`${month}-12`);
    await page.locator('#e-von').fill('14:00');
    await page.locator('#e-bis').fill('17:30');
    await expect(page.locator('#e-stunden')).toHaveValue('3.5');

    await page.locator('#btn-add').click();

    // hours computed, note empty, and the raw Von/Bis persisted.
    await expect.poll(async () => {
      const { data } = await adminClient()
        .from('shifts')
        .select('hours, note, start_time, end_time')
        .eq('household_id', householdId)
        .eq('date', `${month}-12`)
        .maybeSingle();
      return data ? `${Number(data.hours)}|${data.note}|${data.start_time}|${data.end_time}` : null;
    }, { timeout: 8_000 }).toBe('3.5||14:00:00|17:30:00');

    // The overview shows the range (not the empty note) and the amount.
    await expect(page.locator('#entries-list')).toContainText('14:00-17:30');
    await expect(page.locator('#entries-list')).toContainText('CHF 105.00');
  });

  test('overview shows "{from}-{to}: note" when both a range and a note are set', async ({ signedInUser }) => {
    const { page, householdId } = signedInUser;
    const month = new Date().toISOString().slice(0, 7);
    await seedPaySettings(householdId, month);
    const employeeId = await seedEmployee(householdId);
    await seedWage(employeeId, month, 30);

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });

    await page.locator('#e-datum').fill(`${month}-14`);
    await page.locator('#e-von').fill('09:00');
    await page.locator('#e-bis').fill('12:00');
    await page.locator('#e-notiz').fill('Spielplatz');
    await page.locator('#btn-add').click();

    await expect(page.locator('#entries-list')).toContainText('9:00-12:00: Spielplatz', { timeout: 8_000 });
  });

  test('overnight Von/Bis crosses midnight (22:00–06:00 = 8h)', async ({ signedInUser }) => {
    const { page, householdId } = signedInUser;
    const month = new Date().toISOString().slice(0, 7);
    await seedPaySettings(householdId, month);
    const employeeId = await seedEmployee(householdId);
    await seedWage(employeeId, month, 30);

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });

    await page.locator('#e-datum').fill(`${month}-13`);
    await page.locator('#e-von').fill('22:00');
    await page.locator('#e-bis').fill('06:00');
    await expect(page.locator('#e-stunden')).toHaveValue('8');
  });

  test('wage raise: two versions yield different hourly rates per month', async ({ signedInUser }) => {
    const { page, householdId, userId } = signedInUser;
    const now = new Date();
    const earlierMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const laterDate = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString().slice(0, 10);
    const laterMonth = laterDate.slice(0, 7);

    await seedPaySettings(householdId, earlierMonth);
    const employeeId = await seedEmployee(householdId);
    // Wages first (no shifts in their periods yet), then the shifts.
    await seedWage(employeeId, earlierMonth, 30);
    await seedWage(employeeId, laterMonth, 40);

    await adminClient().from('shifts').insert([
      { household_id: householdId, date: `${earlierMonth}-05`, hours: 2, entered_by: userId, employee_id: employeeId, note: 'old-rate' },
      { household_id: householdId, date: `${laterMonth}-05`,   hours: 2, entered_by: userId, employee_id: employeeId, note: 'new-rate' }
    ]);

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });

    const entries = page.locator('#entries-list');
    await expect(entries).toContainText('old-rate', { timeout: 8_000 });
    await expect(entries).toContainText('new-rate');
    await expect(entries).toContainText('CHF 30.00');
    await expect(entries).toContainText('CHF 40.00');
  });
});
