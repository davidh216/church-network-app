import { expect, test } from '@playwright/test';
import { seededAdmin } from './admin';

test('admin logs in, opens a member profile and the media library, then logs out', async ({
  page,
}) => {
  const admin = seededAdmin();

  // Without a session cookie every page redirects to the login form.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText(/^Welcome back, /)).toBeVisible();

  // Members: find the admin's own row and open the profile.
  await page.getByRole('button', { name: /View Members/ }).click();
  await expect(page.getByRole('heading', { name: 'Church Members' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: admin.email });
  await row.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Basic Information' })).toBeVisible();
  await page.getByRole('button', { name: '×' }).click();
  await expect(page.getByRole('heading', { name: 'Basic Information' })).toBeHidden();

  // Media library.
  await page.getByRole('button', { name: '← Back to Dashboard' }).click();
  await page.getByRole('button', { name: /Media Library/ }).click();
  await expect(page.getByText(/\(\d+ videos\)/)).toBeVisible();

  // Logout clears the session and returns to the login form.
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});
