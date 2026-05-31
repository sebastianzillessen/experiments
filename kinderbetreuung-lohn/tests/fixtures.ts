import { test as base, expect, type Page } from '@playwright/test';
import { uniqueEmail } from './helpers/ids';
import { createConfirmedUser, magicLinkFor } from './helpers/auth';
import { adminClient } from './helpers/supabase';

export type SignedInUser = {
  page: Page;
  email: string;
  userId: string;
  householdId: string;
};

async function followMagicLink(page: Page, actionLink: string): Promise<void> {
  // generateLink returns an action_link that, when visited, sets the session
  // and redirects back to the configured site URL. Wait until the app shows
  // a signed-in state (user-strip becomes visible) before returning.
  await page.goto(actionLink);
  await expect(page.locator('#user-strip')).toBeVisible({ timeout: 10_000 });
}

async function fetchHouseholdId(userId: string): Promise<string> {
  const { data, error } = await adminClient()
    .from('memberships')
    .select('household_id')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data!.household_id as string;
}

export const test = base.extend<{ signedInUser: SignedInUser }>({
  signedInUser: async ({ page }, use) => {
    const email = uniqueEmail();
    const { id: userId } = await createConfirmedUser(email);
    const link = await magicLinkFor(email);
    await followMagicLink(page, link);
    const householdId = await fetchHouseholdId(userId);
    await use({ page, email, userId, householdId });
  }
});

export { expect };
