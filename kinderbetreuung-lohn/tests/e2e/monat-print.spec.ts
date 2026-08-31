import { test, expect } from '../fixtures';
import { adminClient } from '../helpers/supabase';

// Regression guard for the Monatsabrechnung print path.
//
// Background: iOS Safari prints a BLANK page when the printed subtree contains a
// composited scroll layer (an element with -webkit-overflow-scrolling, or an
// overflow scroll/clip container). PR #75 introduced a `.table-wrap` scroll
// container inside the printed Lohnabrechnung and regressed exactly this; the
// fix (#79) collapses `.table-wrap` to display:contents in print and forces
// overflow visible / momentum-scroll off across the printed document.
//
// The blank-page paint bug itself is Safari-specific and cannot be reproduced in
// Chromium. What we CAN assert — under print media emulation — is the structural
// invariant whose violation caused it: the document renders with its content and
// nothing inside the printed subtree is a scroll/clip container.

async function seedHourlyShift(householdId: string, userId: string, month: string) {
  const { error: psErr } = await adminClient().from('pay_settings').insert({
    household_id: householdId,
    effective_month: `${month}-01`,
    data: {
      holidayPercent: 3.59,
      ahvIvEoEmployee: 5.3, ahvIvEoEmployer: 5.3,
      alvEmployee: 1.1, alvEmployer: 1.1,
      fakEmployer: 1.025, withholdingTax: 5,
      adminFeeEmployer: 5,
      uvgEnabled: true, uvgBuEmployer: 0.505, uvgNbuEmployee: 1.432
    }
  });
  if (psErr) throw psErr;

  const { data: emp, error: empErr } = await adminClient()
    .from('employees')
    .insert({ household_id: householdId, data: { name: 'Erika Beispiel' } })
    .select('id')
    .single();
  if (empErr) throw empErr;
  const employeeId = emp!.id as string;

  const { error: wageErr } = await adminClient()
    .from('employee_wages')
    .insert({ employee_id: employeeId, effective_month: `${month}-01`, hourly_rate: 30 });
  if (wageErr) throw wageErr;

  const { error: shiftErr } = await adminClient().from('shifts').insert({
    household_id: householdId, date: `${month}-05`, hours: 4.5,
    start_time: '07:30', end_time: '12:00', note: '', entered_by: userId, employee_id: employeeId
  });
  if (shiftErr) throw shiftErr;

  return employeeId;
}

test.describe('Monatsabrechnung print', () => {
  test('renders the payslip in print media with no scroll/clip container in the printed doc', async ({ signedInUser }) => {
    const { page, householdId, userId } = signedInUser;
    const month = new Date().toISOString().slice(0, 7);
    await seedHourlyShift(householdId, userId, month);

    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });

    // Open the month view; it defaults to the current month and, with a single
    // employee, renders that person's Lohnabrechnung directly.
    await page.locator('#tab-monat').click();
    await page.locator('#m-monat').fill(month);

    const doc = page.locator('#monat-doc .print-doc');
    await expect(doc).toBeVisible({ timeout: 10_000 });
    await expect(doc).toContainText('Lohnabrechnung Privathaushalt');
    // The wrapped hourly table is present with its content.
    await expect(page.locator('#monat-doc .table-wrap table')).toContainText('7:30-12:00');

    // Switch to print media and assert the print invariants.
    await page.emulateMedia({ media: 'print' });

    // 1) The document still lays out with content (not blank/hidden).
    const docBox = await doc.boundingBox();
    expect(docBox && docBox.width > 0 && docBox.height > 0).toBeTruthy();

    // 2) No element inside the printed document is a scroll/clip container, and
    //    every .table-wrap collapses to display:contents (generates no box).
    const offenders = await page.locator('#monat-doc').evaluate((root: HTMLElement) => {
      const bad: { tag: string; cls: string; reason: string }[] = [];
      const els = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
      for (const el of els) {
        const cs = getComputedStyle(el);
        const clips = (v: string) => v === 'scroll' || v === 'auto' || v === 'hidden' || v === 'clip';
        if (clips(cs.overflowX) || clips(cs.overflowY)) {
          bad.push({ tag: el.tagName, cls: el.className, reason: `overflow ${cs.overflowX}/${cs.overflowY}` });
        }
        if (el.classList.contains('table-wrap') && cs.display !== 'contents') {
          bad.push({ tag: el.tagName, cls: el.className, reason: `table-wrap display=${cs.display}` });
        }
      }
      return bad;
    });
    expect(offenders, `printed doc must contain no scroll/clip container: ${JSON.stringify(offenders)}`).toEqual([]);

    await page.emulateMedia({ media: 'screen' });
  });

  test('on a phone-width viewport the printed header stays side-by-side (compact, one page)', async ({ signedInUser }) => {
    const { page, householdId, userId } = signedInUser;
    const month = new Date().toISOString().slice(0, 7);
    await seedHourlyShift(householdId, userId, month);

    // iOS prints the mobile layout (viewport ≤ 600px), which stacks the header
    // and pushes the payslip onto a second page. The print rules must force it
    // back side-by-side.
    await page.setViewportSize({ width: 390, height: 780 });
    await page.reload();
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
    await page.locator('#tab-monat').click();
    await page.locator('#m-monat').fill(month);
    await expect(page.locator('#monat-doc .print-doc')).toBeVisible({ timeout: 10_000 });

    // On screen at this width the header stacks (column) …
    const screenDir = await page.locator('#monat-doc .print-doc .doc-header')
      .evaluate(el => getComputedStyle(el).flexDirection);
    expect(screenDir).toBe('column');

    // … but in print it must be side-by-side (row) to fit one page.
    await page.emulateMedia({ media: 'print' });
    const printDir = await page.locator('#monat-doc .print-doc .doc-header')
      .evaluate(el => getComputedStyle(el).flexDirection);
    expect(printDir).toBe('row');

    await page.emulateMedia({ media: 'screen' });
  });
});
