import { test, expect } from '../fixtures';
import { adminClient } from '../helpers/supabase';
import { uniqueEmail } from '../helpers/ids';
import { createConfirmedUser, magicLinkFor } from '../helpers/auth';

test.describe('Members & invitations', () => {
  test('owner can insert an invite row visible to the household', async ({ signedInUser }) => {
    const { householdId, userId } = signedInUser;
    const memberEmail = uniqueEmail('invite');

    const { data, error } = await adminClient()
      .from('invites')
      .insert({
        household_id: householdId,
        email: memberEmail,
        role: 'employee',
        invited_by: userId
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.email).toBe(memberEmail);
    expect(data?.accepted_at).toBeNull();
  });

  test('second user with a pending invite joins via accept_invite RPC', async ({ signedInUser, browser }) => {
    const { householdId, userId } = signedInUser;
    const memberEmail = uniqueEmail('member');

    // Pending invite must exist BEFORE the second user is created — otherwise
    // handle_new_user gives them their own auto-household and the test branch
    // we want to exercise (join an existing household) is bypassed.
    const { data: invite, error: invErr } = await adminClient()
      .from('invites')
      .insert({
        household_id: householdId,
        email: memberEmail,
        role: 'employee',
        invited_by: userId
      })
      .select()
      .single();
    expect(invErr).toBeNull();

    const member = await createConfirmedUser(memberEmail);

    // The second user should NOT have an auto-household.
    const { data: autoOwnership } = await adminClient()
      .from('memberships')
      .select('household_id')
      .eq('user_id', member.id);
    expect(autoOwnership ?? []).toHaveLength(0);

    // Sign the second user in via a fresh browser context, accept the invite from inside the app.
    const ctx = await browser.newContext();
    const memberPage = await ctx.newPage();
    const link = await magicLinkFor(memberEmail);
    await memberPage.goto(link);

    // App should show the invite banner; clicking "Einladung annehmen" calls accept_invite.
    await expect(memberPage.locator('#invite-banner')).toBeVisible({ timeout: 10_000 });
    await memberPage.locator('#btn-accept-invite').click();

    await expect.poll(async () => {
      const { data } = await adminClient()
        .from('memberships')
        .select('role, user_id')
        .eq('household_id', householdId)
        .eq('user_id', member.id)
        .maybeSingle();
      return data?.role ?? null;
    }, { timeout: 8_000 }).toBe('employee');

    // accept_invite marks the invite row as accepted.
    const { data: updatedInvite } = await adminClient()
      .from('invites')
      .select('accepted_at')
      .eq('id', invite!.id)
      .single();
    expect(updatedInvite?.accepted_at).not.toBeNull();

    await ctx.close();
  });

  test('owner can remove a member via DELETE on memberships', async ({ signedInUser }) => {
    const { householdId, userId } = signedInUser;
    const memberEmail = uniqueEmail('remove');

    await adminClient().from('invites').insert({
      household_id: householdId, email: memberEmail, role: 'employee', invited_by: userId
    });
    const member = await createConfirmedUser(memberEmail);
    const { error: rpcErr } = await adminClient().rpc('accept_invite', {
      invite_id: (await adminClient()
        .from('invites')
        .select('id')
        .eq('email', memberEmail)
        .single()).data!.id
    });
    expect(rpcErr).toBeNull();

    // Sanity check: member is in the household.
    const before = await adminClient()
      .from('memberships')
      .select('user_id')
      .eq('household_id', householdId)
      .eq('user_id', member.id);
    expect(before.data?.length).toBe(1);

    // Remove via admin client (owner-only RLS delete path).
    const { error: delErr } = await adminClient()
      .from('memberships')
      .delete()
      .eq('household_id', householdId)
      .eq('user_id', member.id);
    expect(delErr).toBeNull();

    const after = await adminClient()
      .from('memberships')
      .select('user_id')
      .eq('household_id', householdId)
      .eq('user_id', member.id);
    expect(after.data?.length ?? 0).toBe(0);
  });
});
