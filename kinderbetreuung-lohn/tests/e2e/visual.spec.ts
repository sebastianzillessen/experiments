import { test, expect, type Page } from '@playwright/test';
import { adminClient } from '../helpers/supabase';
import { createConfirmedUser, magicLinkFor } from '../helpers/auth';

/**
 * Visual regression spec. Baselines are generated against the vanilla-JS app
 * (npx playwright test visual --update-snapshots) and the React rebuild must
 * stay within maxDiffPixelRatio 0.1 of them.
 *
 * Everything rendered is pinned: fixed emails (DB is reset by global-setup on
 * every run), fixed shift dates/months, explicitly filled date inputs. The
 * only nondeterministic element (#sync-status transitions) is masked.
 */

const SHOT = {
  fullPage: true,
  maxDiffPixelRatio: 0.1,
  animations: 'disabled' as const
};

const DEFAULT_PS_DATA = {
  hourlyRate: 30, vacationPercent: 8.33,
  ahvIvEoEmployee: 5.3, ahvIvEoEmployer: 5.3,
  alvEmployee: 1.1, alvEmployer: 1.1,
  fakEmployer: 1, withholdingTax: 5,
  adminFeeEmployer: 0.4,
  uvgEnabled: true, uvgBuEmployer: 0.505, uvgNbuEmployee: 1.47
};

async function householdIdOf(userId: string): Promise<string> {
  const { data, error } = await adminClient()
    .from('memberships')
    .select('household_id')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data!.household_id as string;
}

async function signIn(page: Page, email: string): Promise<void> {
  const link = await magicLinkFor(email);
  await page.goto(link);
}

test.describe('Visual parity', () => {
  // Baselines are platform-tied (generated on macOS/Chromium); CI runs Linux
  // and has no matching snapshots. The 12 functional tests remain the CI gate.
  test.skip(!!process.env.CI, 'visual baselines are darwin-only');

  test('login screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page).toHaveScreenshot('login.png', SHOT);
  });

  test('create-household screen', async ({ page }) => {
    const email = 'visual-nohousehold@e2e.local';
    const { id: userId } = await createConfirmedUser(email);
    // Strip the auto-created household so the app falls through to the
    // create-household overlay (signed in, no membership, no invite).
    const hh = await householdIdOf(userId);
    await adminClient().from('memberships').delete().eq('user_id', userId);
    await adminClient().from('households').delete().eq('id', hh);

    await signIn(page, email);
    await expect(page.locator('#create-household-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveScreenshot('create-household.png', SHOT);
  });

  test('invite banner', async ({ page }) => {
    const ownerEmail = 'visual-inviteowner@e2e.local';
    const inviteeEmail = 'visual-invitee@e2e.local';
    const { id: ownerId } = await createConfirmedUser(ownerEmail);
    const hh = await householdIdOf(ownerId);
    await adminClient().from('households').update({ name: 'Familie Visual' }).eq('id', hh);
    const { error } = await adminClient().from('invites').insert({
      household_id: hh, email: inviteeEmail, role: 'employee', invited_by: ownerId
    });
    if (error) throw error;
    await createConfirmedUser(inviteeEmail);

    await signIn(page, inviteeEmail);
    await expect(page.locator('#invite-banner')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveScreenshot('invite-banner.png', SHOT);
  });

  test('all tabs (owner with seeded data)', async ({ page }) => {
    const email = 'visual-tabs@e2e.local';
    const { id: userId } = await createConfirmedUser(email);
    const hh = await householdIdOf(userId);
    const admin = adminClient();

    const { error: profErr } = await admin.from('household_profile').upsert({
      household_id: hh,
      employer: { name: 'Familie Visual', address: 'Bahnhofstrasse 1, 8001 Zürich', billingNumber: '123.456' },
      employee: {
        name: 'Erika Beispiel', address: 'Seestrasse 2, 8002 Zürich',
        birthDate: '1990-04-15', ahvNumber: '756.1234.5678.90',
        iban: 'CH93 0076 2011 6238 5295 7', weeklyHoursThreshold8h: true
      },
      updated_at: new Date().toISOString()
    });
    if (profErr) throw profErr;

    const { error: psErr } = await admin.from('pay_settings').insert([
      { household_id: hh, effective_month: '2026-03-01', data: { ...DEFAULT_PS_DATA, hourlyRate: 30 } },
      { household_id: hh, effective_month: '2026-04-01', data: { ...DEFAULT_PS_DATA, hourlyRate: 40 } }
    ]);
    if (psErr) throw psErr;

    const { error: shiftErr } = await admin.from('shifts').insert([
      { household_id: hh, date: '2026-03-05', hours: 3,   note: 'Betreuung Nachmittag', entered_by: userId },
      { household_id: hh, date: '2026-03-12', hours: 4,   note: '',                     entered_by: userId },
      { household_id: hh, date: '2026-04-02', hours: 2.5, note: 'Abend',                entered_by: userId }
    ]);
    if (shiftErr) throw shiftErr;

    const { error: invErr } = await admin.from('invites').insert({
      household_id: hh, email: 'visual-pending@e2e.local', role: 'admin', invited_by: userId
    });
    if (invErr) throw invErr;

    await signIn(page, email);
    await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
    const mask = [page.locator('#sync-status')];

    // Erfassung — pin the default (today) date input.
    await page.locator('#e-datum').fill('2026-05-01');
    await expect(page.locator('#entries-list')).toContainText('Betreuung Nachmittag');
    await expect(page).toHaveScreenshot('tab-erfassung.png', { ...SHOT, mask });

    // Monatsabrechnung — fixed month with shifts.
    await page.locator('#tab-monat').click();
    await page.locator('#m-monat').fill('2026-03');
    await expect(page.locator('#monat-doc')).toContainText('Lohnabrechnung');
    await expect(page).toHaveScreenshot('tab-monat.png', { ...SHOT, mask });

    // Jahresübersicht — fixed year.
    await page.locator('#tab-jahr').click();
    await page.locator('#j-jahr').fill('2026');
    await expect(page.locator('#jahr-doc')).toContainText('Jahresübersicht');
    await expect(page).toHaveScreenshot('tab-jahr.png', { ...SHOT, mask });

    // Stammdaten — inputs prefilled from seeded profile.
    await page.locator('#tab-stammdaten').click();
    await expect(page.locator('#ag-name')).toHaveValue('Familie Visual');
    await expect(page).toHaveScreenshot('tab-stammdaten.png', { ...SHOT, mask });

    // Einstellungen — version list (March version locked by shifts).
    await page.locator('#tab-einstellungen').click();
    await expect(page.locator('#pay-settings-list')).toContainText('Stundenlohn');
    await expect(page).toHaveScreenshot('tab-einstellungen.png', { ...SHOT, mask });

    // Einstellungen — locked version opened in the edit panel.
    await page.locator('#pay-settings-list button').first().click();
    await expect(page.locator('#ps-locked-warn')).toBeVisible();
    await expect(page).toHaveScreenshot('tab-einstellungen-edit.png', { ...SHOT, mask });
    await page.locator('#btn-cancel-pay-settings').click();

    // Mitglieder — member + pending invite.
    await page.locator('#tab-mitglieder').click();
    await expect(page.locator('#members-list')).toContainText(email);
    await expect(page.locator('#invites-list')).toContainText('visual-pending@e2e.local');
    await expect(page).toHaveScreenshot('tab-mitglieder.png', { ...SHOT, mask });

    // Info — static content.
    await page.locator('#tab-info').click();
    await expect(page).toHaveScreenshot('tab-info.png', { ...SHOT, mask });
  });
});
