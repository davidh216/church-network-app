import { expect, test, type Page } from '@playwright/test';
import { seededAdmin } from './admin';

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
  await signIn(page, admin.email, admin.password);

  // Dashboard: real counts from /api/users/summary.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Total members')).toBeVisible();
  await expect(page.getByText('Pending approval')).toBeVisible();

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
  const row = page.getByRole('row').filter({ hasText: admin.email });
  await row.getByRole('link', { name: 'View', exact: true }).click();
  await expect(page).toHaveURL(/\/members\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Basic Information' })).toBeVisible();

  // The profile is a real URL: reloading keeps it, Back returns to the list.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Basic Information' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/members$/);

  // Media library.
  await nav.getByRole('link', { name: 'Media' }).click();
  await expect(page).toHaveURL(/\/media$/);
  await expect(page.getByText(/\(\d+ videos\)/)).toBeVisible();

  // Analytics (staff).
  await nav.getByRole('link', { name: 'Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole('heading', { name: 'Member Analytics Dashboard' })).toBeVisible();

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
