import { test, expect } from '@playwright/test';
import { adminClient } from '../helpers/supabase';
import { uniqueEmail } from '../helpers/ids';
import { createConfirmedUser, authedClientFor } from '../helpers/auth';

// Build an owner household with an employee record that is linked to a second
// person's login (as the accept-invite flow would leave it).
async function setupLinkedEmployee() {
  const ownerEmail = uniqueEmail('unlink-owner');
  const ownerPw = 'unlink-owner-pw';
  const owner = await createConfirmedUser(ownerEmail, ownerPw);
  const { data: m } = await adminClient()
    .from('memberships').select('household_id').eq('user_id', owner.id).single();
  const householdId = m!.household_id as string;

  const { data: emp } = await adminClient()
    .from('employees').insert({ household_id: householdId, data: { name: 'Nanny' } })
    .select('id').single();

  const memberEmail = uniqueEmail('unlink-member');
  const memberPw = 'unlink-member-pw';
  const member = await createConfirmedUser(memberEmail, memberPw); // gets own household too
  await adminClient().from('memberships').insert({ household_id: householdId, user_id: member.id, role: 'employee' });
  await adminClient().from('employees').update({ user_id: member.id }).eq('id', emp!.id);

  return { ownerEmail, ownerPw, householdId, employeeId: emp!.id as string, memberId: member.id };
}

test.describe('Unlink / remove a linked account', () => {
  test('owner can unlink a login from the employee record; membership stays', async () => {
    const s = await setupLinkedEmployee();
    const ownerClient = await authedClientFor(s.ownerEmail, s.ownerPw);

    const { error } = await ownerClient.from('employees').update({ user_id: null }).eq('id', s.employeeId);
    expect(error).toBeNull();

    // Employee record detached …
    const { data: emp } = await adminClient()
      .from('employees').select('user_id').eq('id', s.employeeId).single();
    expect(emp?.user_id).toBeNull();

    // … but the person is still a household member (unlink ≠ remove).
    const { data: membership } = await adminClient()
      .from('memberships').select('role').eq('household_id', s.householdId).eq('user_id', s.memberId).maybeSingle();
    expect(membership?.role).toBe('employee');
  });

  test('owner can remove the account from the household (revoke membership + detach)', async () => {
    const s = await setupLinkedEmployee();
    const ownerClient = await authedClientFor(s.ownerEmail, s.ownerPw);

    const { data: count, error } = await ownerClient.rpc('remove_member', {
      p_household_id: s.householdId, p_user_id: s.memberId
    });
    expect(error).toBeNull();
    expect(count).toBe(1);

    const { error: upErr } = await ownerClient.from('employees').update({ user_id: null }).eq('id', s.employeeId);
    expect(upErr).toBeNull();

    const { data: membership } = await adminClient()
      .from('memberships').select('role').eq('household_id', s.householdId).eq('user_id', s.memberId).maybeSingle();
    expect(membership ?? null).toBeNull();

    const { data: emp } = await adminClient()
      .from('employees').select('user_id').eq('id', s.employeeId).single();
    expect(emp?.user_id).toBeNull();
  });

  test('a non-owner admin may unlink but cannot remove the account from the household', async () => {
    const s = await setupLinkedEmployee();

    // Promote a third user to admin of the same household.
    const adminEmail = uniqueEmail('unlink-admin');
    const adminPw = 'unlink-admin-pw';
    const adminUser = await createConfirmedUser(adminEmail, adminPw);
    await adminClient().from('memberships').insert({ household_id: s.householdId, user_id: adminUser.id, role: 'admin' });
    const adminAuthed = await authedClientFor(adminEmail, adminPw);

    // Unlink (employees UPDATE) is allowed for an admin …
    const { error: unlinkErr } = await adminAuthed.from('employees').update({ user_id: null }).eq('id', s.employeeId);
    expect(unlinkErr).toBeNull();

    // … but remove_member is owner-only.
    const { error: rmErr } = await adminAuthed.rpc('remove_member', {
      p_household_id: s.householdId, p_user_id: s.memberId
    });
    expect(rmErr).not.toBeNull();

    // Membership survived the rejected removal.
    const { data: membership } = await adminClient()
      .from('memberships').select('role').eq('household_id', s.householdId).eq('user_id', s.memberId).maybeSingle();
    expect(membership?.role).toBe('employee');
  });
});
