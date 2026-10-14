import { expect, test, type Page } from '@playwright/test';
import { seededAdmin } from './admin';
import {
  adminRequest,
  createFamilyWithHead,
  createGroupWithMember,
  deleteFamilies,
  deleteGroups,
  deleteSavedSearches,
  E2E_MEMBER,
  ensureE2eMember,
  ensureE2eOther,
  ensureOneVideo,
  userIdByEmail,
} from './api';
import { expectNoSeriousA11yViolations } from './axe';
import { deleteAuditEvents } from './db';

// The saved search the advanced-query test creates; leftovers from interrupted runs are removed
// before the suite and the search itself after it, so church_dev does not grow.
const SAVED_SEARCH_NAME = 'E2E new members';
// The group the group-page test creates and deletes, with its audit events.
const GROUP_NAME = 'E2E smoke group';
// The families the family-page test creates and deletes (the second one only holds a member the
// move confirmation is about), with their audit events.
const FAMILY_NAME = 'E2E smoke family';
const OTHER_FAMILY_NAME = 'E2E smoke other family';

test.beforeAll(async () => {
  const admin = await adminRequest();
  await deleteSavedSearches(admin, SAVED_SEARCH_NAME);
  await deleteGroups(admin, GROUP_NAME);
  for (const name of [FAMILY_NAME, OTHER_FAMILY_NAME]) await deleteFamilies(admin, name);
  // The /media checks (and its axe scan) need at least one card with a play button.
  await ensureOneVideo(admin);
  await admin.dispose();
});

test.afterAll(async () => {
  const admin = await adminRequest();
  await deleteSavedSearches(admin, SAVED_SEARCH_NAME);
  await deleteGroups(admin, GROUP_NAME);
  for (const name of [FAMILY_NAME, OTHER_FAMILY_NAME]) await deleteFamilies(admin, name);
  await admin.dispose();
  deleteAuditEvents('group', GROUP_NAME);
  for (const name of [FAMILY_NAME, OTHER_FAMILY_NAME]) deleteAuditEvents('family', name);
});

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText(/^Welcome back, /)).toBeVisible();
}

test('admin navigates the dashboard, members, a profile, media, analytics and the audit log, then logs out', async ({
  page,
}) => {
  const admin = seededAdmin();

  // Without a session cookie every page redirects to the login form.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await expectNoSeriousA11yViolations(page, '/login');
  await signIn(page, admin.email, admin.password);

  // Dashboard: real counts from /api/users/summary.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Total members')).toBeVisible();
  await expect(page.getByText('Pending approval')).toBeVisible();
  await expectNoSeriousA11yViolations(page, '/');

  // On a fresh load the skip link is the first Tab stop and moves focus to the main region.
  await page.reload();
  await expect(page.getByText('Pending approval')).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main-content')).toBeFocused();

  // Members: find the admin's own row and open the profile route.
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Members' }).click();
  await expect(page).toHaveURL(/\/members$/);
  await expect(page.getByRole('heading', { name: 'Church Members' })).toBeVisible();
  // The search runs on the server (debounced) and the input keeps focus while results load.
  const search = page.getByPlaceholder(/Search by name/);
  await search.fill(admin.email);
  await expect(page.getByText('(1 total)')).toBeVisible();
  await expect(search).toBeFocused();
  await expectNoSeriousA11yViolations(page, '/members');

  // Add Member opens a modal dialog: focus moves in, axe passes with it open, Escape closes it
  // and focus returns to the button.
  const addMember = page.getByRole('button', { name: 'Add Member' });
  await addMember.click();
  const dialog = page.getByRole('dialog', { name: 'Add New Member' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Full Name *')).toBeFocused();
  await expectNoSeriousA11yViolations(page, '/members with the Add Member dialog');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(addMember).toBeFocused();
  // Manage Tags (staff) passes axe while open, with the form shown too; nothing is saved.
  const manageTags = page.getByRole('button', { name: 'Manage Tags' });
  await manageTags.click();
  const tagsDialog = page.getByRole('dialog', { name: 'Manage Tags' });
  await expect(tagsDialog.getByRole('status', { name: 'Loading tags' })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page, '/members with the Manage Tags dialog');
  await tagsDialog.getByRole('button', { name: 'New Tag' }).click();
  await expect(tagsDialog.getByLabel('Name *')).toBeFocused();
  await expectNoSeriousA11yViolations(page, '/members with the new tag form');
  await page.keyboard.press('Escape');
  await expect(tagsDialog).toHaveCount(0);
  await expect(manageTags).toBeFocused();
  const row = page.getByRole('row').filter({ hasText: admin.email });
  await row.getByRole('link', { name: 'View', exact: true }).click();
  await expect(page).toHaveURL(/\/members\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Basic Information' })).toBeVisible();

  // The profile is a real URL: reloading keeps it, Back returns to the list.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Basic Information' })).toBeVisible();
  await expectNoSeriousA11yViolations(page, '/members/[id]');
  await page.goBack();
  await expect(page).toHaveURL(/\/members$/);

  // Media library.
  await nav.getByRole('link', { name: 'Media' }).click();
  await expect(page).toHaveURL(/\/media$/);
  await expect(page.getByText(/\([1-9]\d* videos\)/)).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading videos' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Play / }).first()).toBeAttached();
  await expectNoSeriousA11yViolations(page, '/media');

  // Groups: the directory, and the New Group dialog passes axe while open; nothing is saved.
  await nav.getByRole('link', { name: 'Groups' }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Groups' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading groups' })).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'Loading your groups' })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page, '/groups');
  const newGroup = page.getByRole('button', { name: 'New Group' });
  await newGroup.click();
  const groupDialog = page.getByRole('dialog', { name: 'New Group' });
  await expect(groupDialog.getByLabel('Name *')).toBeFocused();
  await expectNoSeriousA11yViolations(page, '/groups with the New Group dialog');
  await page.keyboard.press('Escape');
  await expect(groupDialog).toHaveCount(0);
  await expect(newGroup).toBeFocused();

  // Services (staff): the month list, and the New Service dialog passes axe while open.
  await nav.getByRole('link', { name: 'Services' }).click();
  await expect(page).toHaveURL(/\/services$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading services' })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page, '/services');
  const newService = page.getByRole('button', { name: 'New Service' });
  await newService.click();
  const serviceDialog = page.getByRole('dialog', { name: 'New Service' });
  await expect(serviceDialog.getByLabel('Date *')).toBeFocused();
  await expectNoSeriousA11yViolations(page, '/services with the New Service dialog');
  await page.keyboard.press('Escape');
  await expect(serviceDialog).toHaveCount(0);
  await expect(newService).toBeFocused();

  // Analytics (staff).
  await nav.getByRole('link', { name: 'Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole('heading', { name: 'Member Analytics Dashboard' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading analytics' })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page, '/analytics');

  // Audit log (admin).
  await nav.getByRole('link', { name: 'Audit Log' }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Audit Log' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading the audit log' })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page, '/admin/audit');

  // Unknown routes get the not-found page.
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

  // Logout clears the session and returns to the login form.
  await page.goto('/');
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('a member visiting /analytics or /services lands on the dashboard with a notice', async ({
  page,
}) => {
  // The one reusable member account (no staff role), created only if it cannot sign in.
  const admin = await adminRequest();
  const user = await ensureE2eMember(admin);
  await admin.dispose();

  await page.goto('/login');
  await signIn(page, E2E_MEMBER.email, E2E_MEMBER.password);
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Analytics' }),
  ).toHaveCount(0);

  await page.goto('/analytics');
  await expect(page).toHaveURL(/\/\?notice=staff-only$/);
  await expect(
    page.getByRole('status').filter({ hasText: 'That page is only available to staff.' }),
  ).toBeVisible();
  // A member's dashboard has the single Members tile.
  await expect(page.locator('section[aria-label="Member counts"] dt')).toHaveText(['Members']);

  // The staff-only services route: no nav link, and a visit redirects with the same notice.
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Services' }),
  ).toHaveCount(0);
  await page.goto('/services');
  await expect(page).toHaveURL(/\/\?notice=staff-only$/);
  await expect(
    page.getByRole('status').filter({ hasText: 'That page is only available to staff.' }),
  ).toBeVisible();

  // Members may open their own profile, but not anyone else's.
  await page.goto(`/members/${user.id}`);
  await expect(page.getByRole('heading', { name: E2E_MEMBER.name })).toBeVisible();
  await page.goto('/members/clnotme000000000000000000');
  await expect(page).toHaveURL(/\/\?notice=staff-only$/);
});

test('admin builds an advanced query, saves it, reloads and applies it', async ({ page }) => {
  const admin = seededAdmin();
  await page.goto('/login');
  await signIn(page, admin.email, admin.password);
  await page.goto('/members');
  await expect(page.getByRole('heading', { name: 'Church Members' })).toBeVisible();

  // stage equals new_member AND engagement score at least 50.
  await page.getByRole('button', { name: 'Advanced Search' }).click();
  await page.getByLabel('Condition 1 field').selectOption('engagement.membershipStage');
  await page.getByLabel('Condition 1 operator').selectOption('equals');
  await page.getByLabel('Condition 1 value').selectOption('new_member');
  await page.getByRole('button', { name: 'Add Condition' }).click();
  await page.getByLabel('Condition 2 field').selectOption('engagement.engagementScore');
  await page.getByLabel('Condition 2 operator').selectOption('gte');
  await page.getByLabel('Condition 2 value').fill('50');
  await expectNoSeriousA11yViolations(page, '/members with the advanced search open');
  await page.getByRole('button', { name: 'Apply Search' }).click();
  await expect(page.getByText('Advanced query active')).toBeVisible();

  // Save it (beforeAll removed any leftover of the same name).
  const name = SAVED_SEARCH_NAME;
  await page.getByRole('button', { name: 'Saved Searches' }).click();
  await page.getByRole('button', { name: 'Save Current Search' }).click();
  await page.getByLabel('Search name').fill(name);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: `Apply ${name}` })).toBeVisible();

  // After a reload the query is gone until the saved search is applied again.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Church Members' })).toBeVisible();
  await expect(page.getByText('Advanced query active')).toHaveCount(0);
  await page.getByRole('button', { name: 'Saved Searches' }).click();
  await page.getByRole('button', { name: `Apply ${name}` }).click();
  await expect(page.getByText('Advanced query active')).toBeVisible();

  // The list shows what the API returns for the same query.
  const query = {
    conditions: [
      { field: 'engagement.membershipStage', operator: 'equals', value: 'new_member' },
      { field: 'engagement.engagementScore', operator: 'gte', value: 50 },
    ],
    logic: 'AND',
    page: 1,
    pageSize: 25,
  };
  const response = await page.request.post('/api/users/search', { data: query });
  expect(response.status()).toBe(200);
  const { total } = (await response.json()) as { total: number };
  await expect(page.getByText(`(${total} total)`)).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading members' })).toHaveCount(0);
  await expect(page.locator('table tbody tr')).toHaveCount(Math.min(total, 25));
  // afterAll deletes the saved search.
});

test('admin opens a group page and a family page with their dialogs, then deletes both', async ({
  page,
}) => {
  const admin = seededAdmin();
  await page.goto('/login');
  await signIn(page, admin.email, admin.password);
  // The group is set up through the page's own session (the login limit counts every sign-in),
  // with the admin as its co-leader.
  const me = (await (await page.request.get('/api/auth/me')).json()) as {
    user: { id: string; name: string };
  };
  const groupId = await createGroupWithMember(page.request, GROUP_NAME, me.user.id);

  await page.goto(`/groups/${groupId}`);
  await expect(page.getByRole('heading', { level: 1, name: GROUP_NAME })).toBeVisible();
  const roster = page.getByRole('region', { name: /^Roster/ });
  await expect(roster.getByRole('link', { name: me.user.name })).toBeVisible();
  await expect(roster.getByLabel(`Role of ${me.user.name}`)).toHaveValue('co_leader');
  // The add-member search: a debounced name query against the member search.
  await page.getByLabel('Find a member').fill(admin.email);
  const matches = page.getByRole('list', { name: 'Matching members' });
  await expect(matches.getByText('In the group')).toBeVisible();
  await expectNoSeriousA11yViolations(page, '/groups/[id]');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit Group' });
  await expect(editDialog.getByLabel('Name *')).toBeFocused();
  await expectNoSeriousA11yViolations(page, '/groups/[id] with the Edit Group dialog');
  await page.keyboard.press('Escape');
  await expect(editDialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Delete Group?' });
  await expect(deleteDialog).toContainText('and its roster (1 person)');
  await expectNoSeriousA11yViolations(page, '/groups/[id] with the Delete Group dialog');
  await deleteDialog.getByRole('button', { name: 'Delete Group' }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await expect(page.getByRole('link', { name: GROUP_NAME })).toHaveCount(0);
  // afterAll removes the group's audit events (and the group, if this test failed before).

  // Families (same session: the login limit counts every sign-in). The admin heads the family and
  // the e2e member (created by the member test) joins it; a third member heads another family,
  // so adding them asks before moving. Nothing is moved and both families are deleted at the end,
  // which unlinks their members again.
  const nav = page.getByRole('navigation', { name: 'Main' });
  const memberId = await userIdByEmail(page.request, E2E_MEMBER.email);
  // Each family below is created around someone who has none: a member already in a family would
  // be refused (409) or, for the third, would make the move confirmation name another family.
  const familyOf = async (id: string) => {
    const res = await page.request.get(`/api/member-details/${id}`);
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { user: { family?: { familyName: string } | null } };
    return body.user.family?.familyName ?? null;
  };
  // The third person is a fixed e2e account, so the test does not depend on church_dev's data.
  const third = await ensureE2eOther(page.request);
  for (const id of [me.user.id, memberId, third.id]) {
    const family = await familyOf(id);
    if (family) throw new Error(`User ${id} already belongs to the family "${family}"`);
  }
  const familyId = await createFamilyWithHead(page.request, FAMILY_NAME, me.user.id);
  expect(
    (
      await page.request.put(`/api/families/${familyId}/members/${memberId}`, { data: {} })
    ).status(),
  ).toBe(200);
  await createFamilyWithHead(page.request, OTHER_FAMILY_NAME, third.id);

  await nav.getByRole('link', { name: 'Families' }).click();
  await expect(page).toHaveURL(/\/families$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Families' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading families' })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page, '/families');
  const newFamily = page.getByRole('button', { name: 'New Family' });
  await newFamily.click();
  const familyDialog = page.getByRole('dialog', { name: 'New Family' });
  await expect(familyDialog.getByLabel('Family name *')).toBeFocused();
  await expectNoSeriousA11yViolations(page, '/families with the New Family dialog');
  await page.keyboard.press('Escape');
  await expect(newFamily).toBeFocused();

  await page.getByLabel('Search by name').fill(FAMILY_NAME);
  await page.getByRole('link', { name: FAMILY_NAME, exact: true }).click();
  await expect(
    // The name already ends with "family", so the heading does not repeat it.
    page.getByRole('heading', { level: 1, name: FAMILY_NAME, exact: true }),
  ).toBeVisible();
  const members = page.getByRole('region', { name: 'Members (2)' });
  await expect(members.getByLabel('Head of family')).toHaveValue(me.user.id);
  await expect(members.getByRole('link', { name: E2E_MEMBER.name })).toBeVisible();
  await expectNoSeriousA11yViolations(page, '/families/[id]');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const editFamily = page.getByRole('dialog', { name: 'Edit Family' });
  await expect(editFamily.getByLabel('Family name *')).toBeFocused();
  await expectNoSeriousA11yViolations(page, '/families/[id] with the Edit Family dialog');
  await page.keyboard.press('Escape');
  await expect(editFamily).toHaveCount(0);

  await page.getByRole('button', { name: 'Set relationship' }).click();
  const relationship = page.getByRole('dialog', { name: 'Set Relationship' });
  await relationship.getByLabel('is the').selectOption('spouse');
  await expectNoSeriousA11yViolations(page, '/families/[id] with the Set Relationship dialog');
  await relationship.getByRole('button', { name: 'Save Relationship' }).click();
  await expect(relationship).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Relationships' })).toContainText(
    / is the spouse of .* · .* is the spouse of /,
  );

  await page.getByLabel('Find a member').fill(third.name);
  await page
    .getByRole('list', { name: 'Matching members' })
    .getByRole('button', { name: `Add ${third.name} to the family` })
    .first()
    .click();
  const move = page.getByRole('dialog', { name: `Move ${third.name}?` });
  await expect(move).toContainText(`already belongs to the ${OTHER_FAMILY_NAME}.`);
  await expectNoSeriousA11yViolations(page, '/families/[id] with the move confirmation');
  await move.getByRole('button', { name: 'Cancel' }).click();
  await expect(move).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const deleteFamily = page.getByRole('dialog', { name: 'Delete Family?' });
  await expect(deleteFamily).toContainText('Its 2 members stay in the directory without a family.');
  await expectNoSeriousA11yViolations(page, '/families/[id] with the Delete Family dialog');
  await deleteFamily.getByRole('button', { name: 'Delete Family' }).click();
  await expect(page).toHaveURL(/\/families$/);
  // afterAll deletes the other family and every family audit event of the run.
});
