import { test as base, expect } from '@playwright/test';
import { test as authedTest } from '../fixtures';
import { adminClient, anonClient, clientForUser } from '../helpers/supabase';
import { uniqueEmail } from '../helpers/ids';
import { createConfirmedUser } from '../helpers/auth';

const test = base;

// Sign a confirmed user in via password and return a client bound to their JWT,
// so we can call the auth-context RPCs (create_link_invite / accept_invite_by_token)
// the way the app does.
async function authedClientFor(email: string, password: string) {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  const s = data.session!;
  return clientForUser(s.access_token, s.refresh_token);
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.find(u => (u.email ?? '').toLowerCase() === email.toLowerCase())?.id ?? null;
}

test.describe('Link invitations (invite by URL, no email known)', () => {
  test('create_link_invite mints a tokened, email-less invite for the household', async () => {
    const ownerEmail = uniqueEmail('link-owner');
    const password = 'link-owner-pw-1';
    const owner = await createConfirmedUser(ownerEmail, password);
    const ownerClient = await authedClientFor(ownerEmail, password);

    const { data: token, error } = await ownerClient.rpc('create_link_invite', { p_role: 'employee' });
    expect(error).toBeNull();
    expect(typeof token).toBe('string');
    expect((token as string).length).toBeGreaterThan(20);

    const { data: invite } = await adminClient()
      .from('invites')
      .select('email, token, role, household_id, accepted_at')
      .eq('token', token)
      .single();
    expect(invite?.email).toBeNull();
    expect(invite?.role).toBe('employee');
    expect(invite?.accepted_at).toBeNull();

    const { data: ownerMembership } = await adminClient()
      .from('memberships').select('household_id').eq('user_id', owner.id).single();
    expect(invite?.household_id).toBe(ownerMembership?.household_id);
  });

  test('a brand-new signup carrying the token joins the household and gets NO own household', async () => {
    // Owner mints a link invite.
    const ownerEmail = uniqueEmail('link-owner');
    const password = 'link-owner-pw-2';
    await createConfirmedUser(ownerEmail, password);
    const ownerClient = await authedClientFor(ownerEmail, password);
    const { data: token } = await ownerClient.rpc('create_link_invite', { p_role: 'admin' });
    const { data: inviteRow } = await adminClient()
      .from('invites').select('household_id').eq('token', token).single();
    const householdId = inviteRow!.household_id as string;

    // The invitee registers with the token in signup metadata — exactly what the
    // login screen sends (options.data.invite_token). handle_new_user consumes it.
    const inviteeEmail = uniqueEmail('link-invitee');
    const { data: created, error: createErr } = await adminClient().auth.admin.createUser({
      email: inviteeEmail,
      email_confirm: true,
      user_metadata: { invite_token: token }
    });
    expect(createErr).toBeNull();
    const inviteeId = created.user!.id;

    // Joined the inviting household with the invite's role …
    const { data: membership } = await adminClient()
      .from('memberships').select('household_id, role').eq('user_id', inviteeId);
    expect(membership).toHaveLength(1);
    expect(membership![0].household_id).toBe(householdId);
    expect(membership![0].role).toBe('admin');

    // … and the token is now spent.
    const { data: invite } = await adminClient()
      .from('invites').select('accepted_at').eq('token', token).single();
    expect(invite?.accepted_at).not.toBeNull();
  });

  test('accept_invite_by_token lets an already-registered user join via the link', async () => {
    const ownerEmail = uniqueEmail('link-owner');
    const ownerPw = 'link-owner-pw-3';
    await createConfirmedUser(ownerEmail, ownerPw);
    const ownerClient = await authedClientFor(ownerEmail, ownerPw);
    const { data: token } = await ownerClient.rpc('create_link_invite', { p_role: 'employee' });
    const { data: inviteRow } = await adminClient()
      .from('invites').select('household_id').eq('token', token).single();
    const householdId = inviteRow!.household_id as string;

    // A second user who already has their own account (and own household).
    const secondEmail = uniqueEmail('link-second');
    const secondPw = 'link-second-pw-3';
    const second = await createConfirmedUser(secondEmail, secondPw);
    const secondClient = await authedClientFor(secondEmail, secondPw);

    const { data: joinedHousehold, error } = await secondClient.rpc('accept_invite_by_token', { p_token: token });
    expect(error).toBeNull();
    expect(joinedHousehold).toBe(householdId);

    const { data: membership } = await adminClient()
      .from('memberships').select('role').eq('household_id', householdId).eq('user_id', second.id).single();
    expect(membership?.role).toBe('employee');

    // Re-using the same token is a no-op (single-use): already accepted → null.
    const { data: secondTry } = await secondClient.rpc('accept_invite_by_token', { p_token: token });
    expect(secondTry).toBeNull();
  });

  test('invite_info exposes the household name to an anonymous (not-yet-registered) visitor', async () => {
    const ownerEmail = uniqueEmail('link-owner');
    const ownerPw = 'link-owner-pw-4';
    await createConfirmedUser(ownerEmail, ownerPw);
    const ownerClient = await authedClientFor(ownerEmail, ownerPw);
    const { data: token } = await ownerClient.rpc('create_link_invite', { p_role: 'employee' });

    const { data, error } = await anonClient().rpc('invite_info', { p_token: token });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row?.household_name).toBeTruthy();
    expect(row?.role).toBe('employee');

    // A bogus token reveals nothing.
    const { data: none } = await anonClient().rpc('invite_info', { p_token: 'not-a-real-token' });
    expect(Array.isArray(none) ? none : []).toHaveLength(0);
  });
});

authedTest('owner creates an invite link in the UI; a fresh visitor registers and joins', async ({ signedInUser, browser }) => {
  const { page, householdId } = signedInUser;

  // Owner: Mitglieder tab → create an invite link, read it back from the field.
  await page.locator('#tab-mitglieder').click();
  await page.locator('#btn-create-link').click();
  const linkUrl = await page.locator('#link-invite-url').inputValue();
  expect(linkUrl).toContain('invite=');

  // It also shows up as an open (not-yet-redeemed) invite.
  await expect(page.locator('#invites-list')).toContainText('Einladungs-Link');

  // Invitee: a brand-new browser context opens the link and registers.
  const ctx = await browser.newContext();
  const inviteePage = await ctx.newPage();
  await inviteePage.goto(linkUrl);
  await expect(inviteePage.locator('#invite-greeting')).toBeVisible({ timeout: 10_000 });

  const inviteeEmail = uniqueEmail('ui-invitee');
  await inviteePage.locator('#login-email').fill(inviteeEmail);
  await inviteePage.locator('#login-password').fill('ui-invitee-pw-123');
  await inviteePage.locator('#btn-password-signup').click();

  // The signup carries the token as metadata, so handle_new_user joins the
  // invitee to the household at account creation — assert it landed server-side.
  await expect.poll(async () => {
    const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
    const uid = data.users.find(u => (u.email ?? '').toLowerCase() === inviteeEmail.toLowerCase())?.id;
    if (!uid) return null;
    const { data: m } = await adminClient()
      .from('memberships').select('role, household_id').eq('user_id', uid);
    if (!m || m.length !== 1) return null;
    return m[0].household_id === householdId ? m[0].role : `wrong-household:${m[0].household_id}`;
  }, { timeout: 15_000 }).toBe('employee');

  await ctx.close();
});
