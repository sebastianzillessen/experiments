import { test, expect } from '../fixtures';
import { adminClient } from '../helpers/supabase';

const PS_DATA = {
  holidayPercent: 3.59,
  ahvIvEoEmployee: 5.3, ahvIvEoEmployer: 5.3,
  alvEmployee: 1.1, alvEmployer: 1.1,
  fakEmployer: 1.025, withholdingTax: 5,
  adminFeeEmployer: 5,
  uvgEnabled: true, uvgBuEmployer: 0.505, uvgNbuEmployee: 1.432
};

test('new wage version shows a live brutto/netto/costs preview', async ({ signedInUser }) => {
  const { page, householdId } = signedInUser;
  const month = new Date().toISOString().slice(0, 7);
  const admin = adminClient();
  const { error: psErr } = await admin.from('pay_settings')
    .insert({ household_id: householdId, effective_month: `${month}-01`, data: PS_DATA });
  if (psErr) throw psErr;
  const { error: empErr } = await admin.from('employees')
    .insert({ household_id: householdId, data: { name: 'Erika Beispiel' } });
  if (empErr) throw empErr;

  await page.reload();
  await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
  await page.locator('#tab-mitarbeitende').click();
  await page.locator('#mitarbeitende-root button[data-emp-edit]').first().click();

  // The field says what is meant: gross, before deductions, without allowances.
  await expect(page.locator('label[for="wage-new-rate"]')).toContainText('Brutto-Stundenlohn');
  await expect(page.locator('#wage-rate-hint')).toContainText('ohne Ferien- und Feiertagszulage');

  await expect(page.locator('#wage-preview')).toHaveCount(0);
  await page.locator('#wage-new-month').fill(month);
  await page.locator('#wage-new-rate').fill('38');

  // 38 + 8.33 % Ferien + 3.59 % Feiertage = 42.50 brutto → 37.65 netto.
  const preview = page.locator('#wage-preview');
  await expect(preview).toContainText('CHF 42.50');
  await expect(preview.locator('.summary-row.netto')).toContainText('CHF 37.65');
  await expect(preview).toContainText('Total Arbeitgeberkosten');

  // Scaling the example hours scales the gross.
  await page.locator('#wage-preview-hours').fill('10');
  await expect(preview).toContainText('10 Std. × CHF 38.00');
  await expect(preview).toContainText('CHF 380.00');
});
