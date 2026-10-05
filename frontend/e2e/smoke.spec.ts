import { expect, test, type Page } from '@playwright/test';
import { seededAdmin } from './admin';
import { expectNoSeriousA11yViolations } from './axe';

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText(/^Welcome back, /)).toBeVisible();
}

test('admin navigates the dashboard, members, a profile, media and analytics, then logs out', async ({
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
  await expect(page.getByText(/\(\d+ videos\)/)).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading videos' })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page, '/media');

  // Analytics (staff).
  await nav.getByRole('link', { name: 'Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole('heading', { name: 'Member Analytics Dashboard' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading analytics' })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page, '/analytics');

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

test('a member visiting /analytics lands on the dashboard with a notice', async ({
  page,
  browser,
}) => {
  const admin = seededAdmin();
  await page.goto('/login');
  await signIn(page, admin.email, admin.password);

  // The admin creates an active member with no staff role (the page shares the session cookie).
  const member = {
    name: 'E2E Member',
    email: `e2e-member-${Date.now()}@example.com`,
    password: `E2e-member-${Date.now()}-pw`,
    isActive: true,
  };
  const created = await page.request.post('/api/users', { data: member });
  expect(created.status()).toBe(201);
  const { user } = (await created.json()) as { user: { id: string } };

  const context = await browser.newContext();
  const memberPage = await context.newPage();
  await memberPage.goto('/login');
  await signIn(memberPage, member.email, member.password);
  await expect(
    memberPage.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Analytics' }),
  ).toHaveCount(0);

  await memberPage.goto('/analytics');
  await expect(memberPage).toHaveURL(/\/\?notice=staff-only$/);
  await expect(
    memberPage.getByRole('status').filter({ hasText: 'That page is only available to staff.' }),
  ).toBeVisible();
  // A member's dashboard has the single Members tile.
  await expect(memberPage.locator('section[aria-label="Member counts"] dt')).toHaveText([
    'Members',
  ]);

  // Members may open their own profile, but not anyone else's.
  await memberPage.goto(`/members/${user.id}`);
  await expect(memberPage.getByRole('heading', { name: 'E2E Member' })).toBeVisible();
  await memberPage.goto('/members/clnotme000000000000000000');
  await expect(memberPage).toHaveURL(/\/\?notice=staff-only$/);
  await context.close();
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

  // Save it under a unique name.
  const name = `E2E new members ${Date.now()}`;
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

  // Clean up the saved search.
  const list = await page.request.get('/api/users/saved-searches');
  const { searches } = (await list.json()) as { searches: { id: string; name: string }[] };
  const saved = searches.find((s) => s.name === name);
  expect(saved).toBeDefined();
  expect((await page.request.delete(`/api/users/saved-searches/${saved!.id}`)).status()).toBe(200);
});
