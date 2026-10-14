import { test, expect } from '../fixtures';
import { adminClient } from '../helpers/supabase';

// Mitarbeitende im AHV-Referenzalter (Rentner/innen): keine ALV, und AHV/IV/EO
// nur auf dem Lohn über dem monatlichen Freibetrag. Bei kleinem Pensum liegt der
// Bruttolohn unter dem Freibetrag, die AHV/IV/EO ist dann 0.

async function seedPensionerShift(householdId: string, userId: string, month: string) {
  const { error: psErr } = await adminClient().from('pay_settings').insert({
    household_id: householdId,
    effective_month: `${month}-01`,
    data: {
      holidayPercent: 3.59,
      ahvIvEoEmployee: 5.3, ahvIvEoEmployer: 5.3,
      alvEmployee: 1.1, alvEmployer: 1.1,
      fakEmployer: 1.025, withholdingTax: 5,
      adminFeeEmployer: 5,
      uvgEnabled: true, uvgBuEmployer: 0.505, uvgNbuEmployee: 1.432,
      ahvPensionerAllowanceMonthly: 1400
    }
  });
  if (psErr) throw psErr;

  const { data: emp, error: empErr } = await adminClient()
    .from('employees')
    .insert({ household_id: householdId, data: { name: 'Rita Rentnerin', pensioner: true } })
    .select('id')
    .single();
  if (empErr) throw empErr;
  const employeeId = emp!.id as string;

  const { error: wageErr } = await adminClient()
    .from('employee_wages')
    .insert({ employee_id: employeeId, effective_month: `${month}-01`, hourly_rate: 33 });
  if (wageErr) throw wageErr;

  const { error: shiftErr } = await adminClient().from('shifts').insert({
    household_id: householdId, date: `${month}-05`, hours: 6,
    note: '', entered_by: userId, employee_id: employeeId
  });
  if (shiftErr) throw shiftErr;

  return employeeId;
}

test.describe('Rentner/in Abrechnung', () => {
  test('no ALV and no AHV below the monthly allowance', async ({ signedInUser }) => {
    const { page, householdId, userId } = signedInUser;
    const month = new Date().toISOString().slice(0, 7);
    await seedPensionerShift(householdId, userId, month);

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });

    await page.locator('#tab-monat').click();
    await page.locator('#m-monat').fill(month);

    const doc = page.locator('#monat-doc .print-doc');
    await expect(doc).toBeVisible({ timeout: 10_000 });
    await expect(doc).toContainText('Lohnabrechnung Privathaushalt');

    // ALV entfällt im Referenzalter (Arbeitnehmer- und Arbeitgeberseite).
    await expect(doc).toContainText('entfällt – AHV-Referenzalter');
    // 6 h × 33 CHF liegt weit unter dem Freibetrag → AHV-pflichtiger Lohn = 0.
    await expect(doc).toContainText('Freibetrag');
  });
});
