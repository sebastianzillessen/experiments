import { test, expect } from '../fixtures';
import { adminClient } from '../helpers/supabase';

const PS = {
  holidayPercent: 3.59, ahvIvEoEmployee: 5.3, ahvIvEoEmployer: 5.3,
  alvEmployee: 1.1, alvEmployer: 1.1, fakEmployer: 1.025, withholdingTax: 5,
  adminFeeEmployer: 5, uvgEnabled: true, uvgBuEmployer: 0.505, uvgNbuEmployee: 1.432
};

async function seedShift(householdId: string, userId: string, month: string) {
  await adminClient().from('pay_settings').insert({ household_id: householdId, effective_month: `${month}-01`, data: PS });
  const { data: emp } = await adminClient().from('employees')
    .insert({ household_id: householdId, data: { name: 'Erika Beispiel' } }).select('id').single();
  const employeeId = emp!.id as string;
  await adminClient().from('employee_wages').insert({ employee_id: employeeId, effective_month: `${month}-01`, hourly_rate: 30 });
  const { data: shift } = await adminClient().from('shifts')
    .insert({ household_id: householdId, date: `${month}-05`, hours: 4, note: 'signoff-test', entered_by: userId, employee_id: employeeId })
    .select('id').single();
  return { employeeId, shiftId: shift!.id as string };
}

test.describe('Month sign-off', () => {
  test('signing off a month locks its shifts and removes them from the Einsätze overview', async ({ signedInUser }) => {
    const { page, householdId, userId } = signedInUser;
    const month = new Date().toISOString().slice(0, 7);
    const { shiftId } = await seedShift(householdId, userId, month);
    page.on('dialog', d => d.accept());

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });

    // The shift shows in the (now "Einsätze") overview.
    await expect(page.locator('#entries-list')).toContainText('signoff-test', { timeout: 8_000 });

    // Sign the month off from the Monatsabrechnung.
    await page.locator('#tab-monat').click();
    await page.locator('#m-monat').fill(month);
    await page.locator('#btn-signoff-month').click();
    await expect(page.locator('#signoff-status')).toContainText('abgeschlossen', { timeout: 8_000 });

    // A lock row now exists.
    await expect.poll(async () => {
      const { data } = await adminClient().from('payroll_locks').select('month').eq('household_id', householdId);
      return (data ?? []).length;
    }, { timeout: 8_000 }).toBe(1);

    // The shift dropped out of the overview.
    await page.locator('#tab-erfassung').click();
    await expect(page.locator('#entries-list')).toContainText('Keine offenen Einsätze');
    await expect(page.locator('#entries-list')).not.toContainText('signoff-test');

    // The DB rejects changes to the locked shift (the trigger fires even for the
    // service role, which only bypasses RLS).
    const upd = await adminClient().from('shifts').update({ hours: 9 }).eq('id', shiftId);
    expect(upd.error).not.toBeNull();
    const del = await adminClient().from('shifts').delete().eq('id', shiftId);
    expect(del.error).not.toBeNull();

    // Reopen restores editability and the overview entry.
    await page.locator('#tab-monat').click();
    await page.locator('#btn-reopen-month').click();
    await expect(page.locator('#btn-signoff-month')).toBeVisible({ timeout: 8_000 });

    await expect.poll(async () => {
      const { data } = await adminClient().from('payroll_locks').select('month').eq('household_id', householdId);
      return (data ?? []).length;
    }, { timeout: 8_000 }).toBe(0);

    const updAfter = await adminClient().from('shifts').update({ hours: 9 }).eq('id', shiftId);
    expect(updAfter.error).toBeNull();

    await page.locator('#tab-erfassung').click();
    await expect(page.locator('#entries-list')).toContainText('signoff-test');
  });
});
