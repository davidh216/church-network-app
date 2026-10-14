import { expect, test as base, type Page } from '@playwright/test';
import {
  adminRequest,
  adminStorageState,
  deleteFamilies,
  deleteGroups,
  deleteTags,
  E2E_MEMBER,
  ensureE2eMember,
} from './api';
import { expectNoSeriousA11yViolations } from './axe';
import { deleteAuditEvents } from './db';

// PHASE5_SPECS.md G6: organise people. The admin creates a tag, tags the e2e member and filters
// the list by it; creates a group with the member as co-leader, which the member then sees under
// "My groups"; and creates a family of the admin and the member with a spouse relationship that
// each profile shows from its own side. Everything it creates (the tag, the group, the family and
// their audit events) is removed before and after the run, so church_dev ends as it started.
const TAG_NAME = 'E2E organise tag';
const GROUP_NAME = 'E2E organise group';
const FAMILY_NAME = 'E2E organise family';

// The admin's pages use the run's shared session: the login limit counts every sign-in.
const test = base.extend({
  storageState: async ({}, provide) => {
    await provide(await adminStorageState());
  },
});

async function removeLeftovers() {
  const admin = await adminRequest();
  await deleteTags(admin, TAG_NAME);
  await deleteGroups(admin, GROUP_NAME);
  await deleteFamilies(admin, FAMILY_NAME);
  await admin.dispose();
  deleteAuditEvents('tag', TAG_NAME);
  deleteAuditEvents('group', GROUP_NAME);
  deleteAuditEvents('family', FAMILY_NAME);
}

test.beforeAll(removeLeftovers);
test.afterAll(removeLeftovers);

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText(/^Welcome back, /)).toBeVisible();
}

/** The family a member belongs to, from the staff profile (null for none). */
async function familyOf(page: Page, userId: string): Promise<string | null> {
  const res = await page.request.get(`/api/member-details/${userId}`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { user: { family?: { familyName: string } | null } };
  return body.user.family?.familyName ?? null;
}

test('admin tags, groups and families a member, who sees the group; each side sees the spouse', async ({
  page,
  browser,
  baseURL,
}) => {
  const admin = await adminRequest();
  const member = await ensureE2eMember(admin);
  await admin.dispose();
  const me = (await (await page.request.get('/api/auth/me')).json()) as {
    user: { id: string; name: string; email: string };
  };
  // The family step adds both without a move: neither may already belong to a family.
  for (const id of [me.user.id, member.id]) {
    const family = await familyOf(page, id);
    if (family) throw new Error(`User ${id} already belongs to the family "${family}"`);
  }
  const nav = page.getByRole('navigation', { name: 'Main' });

  // 1. Create a tag in the Manage Tags dialog.
  await page.goto('/members');
  await expect(page.getByRole('heading', { name: 'Church Members' })).toBeVisible();
  await page.getByRole('button', { name: 'Manage Tags' }).click();
  const tagsDialog = page.getByRole('dialog', { name: 'Manage Tags' });
  await expect(tagsDialog.getByRole('status', { name: 'Loading tags' })).toHaveCount(0);
  await tagsDialog.getByRole('button', { name: 'New Tag' }).click();
  await tagsDialog.getByLabel('Name *').fill(TAG_NAME);
  await expectNoSeriousA11yViolations(page, '/members with the new tag form');
  await tagsDialog.getByRole('button', { name: 'Create Tag' }).click();
  await expect(tagsDialog.getByRole('list', { name: 'Tags' })).toContainText(TAG_NAME);
  await expectNoSeriousA11yViolations(page, '/members with the Manage Tags dialog');
  await page.keyboard.press('Escape');
  await expect(tagsDialog).toHaveCount(0);

  // 2. Tag the member on their profile, then filter the list by the tag.
  await page.goto(`/members/${member.id}`);
  await expect(page.getByRole('heading', { name: E2E_MEMBER.name })).toBeVisible();
  const tagInput = page.getByRole('combobox', { name: 'Tags (staff only)' });
  await tagInput.fill(TAG_NAME);
  await tagInput.press('Enter');
  await expect(page.getByRole('list', { name: 'Tags (staff only)' })).toContainText(TAG_NAME);
  await expect(tagInput).toHaveAttribute('placeholder', 'Type a tag name');
  await expectNoSeriousA11yViolations(page, '/members/[id] with a tag');

  await nav.getByRole('link', { name: 'Members' }).click();
  await expect(page).toHaveURL(/\/members$/);
  await page.getByLabel('Tag', { exact: true }).selectOption({ label: TAG_NAME });
  await expect(page.getByRole('button', { name: `Clear Tag: ${TAG_NAME}` })).toBeVisible();
  await expect(page.getByText('(1 total)')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading members' })).toHaveCount(0);
  const rows = page.locator('table tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(E2E_MEMBER.name);
  await expect(rows.first().getByRole('list', { name: 'Tags' })).toContainText(TAG_NAME);
  await expectNoSeriousA11yViolations(page, '/members filtered by a tag');

  // 3. Create a group and add the member as co-leader.
  await nav.getByRole('link', { name: 'Groups' }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await page.getByRole('button', { name: 'New Group' }).click();
  const groupDialog = page.getByRole('dialog', { name: 'New Group' });
  await groupDialog.getByLabel('Name *').fill(GROUP_NAME);
  await groupDialog.getByLabel('Meeting day').fill('Thursdays');
  await expectNoSeriousA11yViolations(page, '/groups with the New Group dialog');
  await groupDialog.getByRole('button', { name: 'Create Group' }).click();
  await expect(page).toHaveURL(/\/groups\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name: GROUP_NAME })).toBeVisible();
  await page.getByLabel('Role', { exact: true }).selectOption('co_leader');
  await page.getByLabel('Find a member').fill(E2E_MEMBER.email);
  await page
    .getByRole('list', { name: 'Matching members' })
    .getByRole('button', { name: `Add ${E2E_MEMBER.name} as Co-leader` })
    .click();
  const roster = page.getByRole('region', { name: /^Roster/ });
  await expect(roster.getByRole('link', { name: E2E_MEMBER.name })).toBeVisible();
  await expect(roster.getByLabel(`Role of ${E2E_MEMBER.name}`)).toHaveValue('co_leader');
  await expectNoSeriousA11yViolations(page, '/groups/[id] with the member on the roster');

  // 4. As the member: the group is listed under "My groups" with the role.
  const memberContext = await browser.newContext({ baseURL });
  await memberContext.clearCookies();
  const memberPage = await memberContext.newPage();
  await signIn(memberPage, E2E_MEMBER.email, E2E_MEMBER.password);
  await memberPage
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Groups' })
    .click();
  await expect(memberPage).toHaveURL(/\/groups$/);
  const mine = memberPage.getByRole('region', { name: 'My groups' });
  const myGroup = mine.getByRole('listitem').filter({ hasText: GROUP_NAME });
  await expect(myGroup.getByRole('link', { name: GROUP_NAME })).toBeVisible();
  await expect(myGroup).toContainText('Co-leader');
  await expect(memberPage.getByRole('status', { name: 'Loading groups' })).toHaveCount(0);
  await expectNoSeriousA11yViolations(memberPage, '/groups as a member');
  await memberContext.close();

  // 5. Create a family, add the admin and the member, and record that they are spouses.
  await nav.getByRole('link', { name: 'Families' }).click();
  await expect(page).toHaveURL(/\/families$/);
  await page.getByRole('button', { name: 'New Family' }).click();
  const familyDialog = page.getByRole('dialog', { name: 'New Family' });
  await familyDialog.getByLabel('Family name *').fill(FAMILY_NAME);
  await expectNoSeriousA11yViolations(page, '/families with the New Family dialog');
  await familyDialog.getByRole('button', { name: 'Create Family' }).click();
  await expect(page).toHaveURL(/\/families\/[^/]+$/);
  await expect(
    page.getByRole('heading', { level: 1, name: `${FAMILY_NAME} family` }),
  ).toBeVisible();
  const findMember = page.getByLabel('Find a member');
  const matches = page.getByRole('list', { name: 'Matching members' });
  await findMember.fill(me.user.email);
  await matches.getByRole('button', { name: `Add ${me.user.name} to the family` }).click();
  await expect(page.getByRole('region', { name: 'Members (1)' })).toBeVisible();
  await findMember.fill(E2E_MEMBER.email);
  await matches.getByRole('button', { name: `Add ${E2E_MEMBER.name} to the family` }).click();
  const members = page.getByRole('region', { name: 'Members (2)' });
  await expect(members.getByRole('link', { name: E2E_MEMBER.name })).toBeVisible();

  await page.getByRole('button', { name: 'Set relationship' }).click();
  const relationship = page.getByRole('dialog', { name: 'Set Relationship' });
  await relationship.getByLabel('Person').selectOption(member.id);
  await relationship.getByLabel('is the').selectOption('spouse');
  await relationship.getByLabel('of', { exact: true }).selectOption(me.user.id);
  await expect(relationship).toContainText(`${E2E_MEMBER.name} is the spouse of ${me.user.name}.`);
  await expectNoSeriousA11yViolations(page, '/families/[id] with the Set Relationship dialog');
  await relationship.getByRole('button', { name: 'Save Relationship' }).click();
  await expect(relationship).toHaveCount(0);
  // The pair is listed from the side stored first, then from the other side.
  const relationships = page.getByRole('region', { name: 'Relationships' });
  await expect(relationships).toContainText(`${E2E_MEMBER.name} is the spouse of ${me.user.name}`);
  await expect(relationships).toContainText(`${me.user.name} is the spouse of ${E2E_MEMBER.name}`);
  await expectNoSeriousA11yViolations(page, '/families/[id] with two members and a relationship');

  // 6. Each profile's Family tab names the family and shows the other as their spouse.
  for (const [self, other] of [
    [me.user, { id: member.id, name: E2E_MEMBER.name }],
    [{ id: member.id, name: E2E_MEMBER.name }, me.user],
  ] as const) {
    await page.goto(`/members/${self.id}`);
    await expect(page.getByRole('heading', { level: 1, name: self.name })).toBeVisible();
    await page.getByRole('tab', { name: /Family/ }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByRole('link', { name: FAMILY_NAME })).toBeVisible();
    const relative = panel.getByRole('listitem').filter({ hasText: other.name });
    await expect(relative.getByRole('link', { name: other.name })).toBeVisible();
    await expect(relative).toContainText('Spouse');
    await expectNoSeriousA11yViolations(page, `/members/[id] Family tab of ${self.name}`);
  }
  // afterAll deletes the tag, the group and the family, and their audit events.
});
