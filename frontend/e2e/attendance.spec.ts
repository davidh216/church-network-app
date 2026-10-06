import { expect, test, type Page } from '@playwright/test';
import { seededAdmin } from './admin';
import {
  adminRequest,
  deleteServices,
  E2E_MEMBER,
  ensureE2eMember,
  refreshEngagement,
} from './api';
import { expectNoSeriousA11yViolations } from './axe';

// The attendance flow (PHASE3_SPECS.md D8): staff create a service and mark two members present,
// both profiles show it, and the engagement refresh job brings it into the analytics. The service
// is deleted afterwards (with its attendance) and the scores refreshed again, so church_dev ends
// as it started. Service dates are calendar days and the API counts UTC days, so the browser runs
// in UTC too.
test.use({ timezoneId: 'UTC' });

const SERVICE_TITLE = 'E2E Attendance Service';
let memberId = '';
let adminName = '';

test.beforeAll(async () => {
  const admin = await adminRequest();
  await deleteServices(admin, SERVICE_TITLE);
  memberId = (await ensureE2eMember(admin)).id;
  const me = await admin.get('/api/auth/me');
  expect(me.ok()).toBe(true);
  adminName = ((await me.json()) as { user: { name: string } }).user.name;
  await admin.dispose();
});

test.afterAll(async () => {
  const admin = await adminRequest();
  await deleteServices(admin, SERVICE_TITLE);
  await refreshEngagement(admin);
  await admin.dispose();
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText(/^Welcome back, /)).toBeVisible();
}

test('staff record attendance, both profiles show it and the refreshed analytics count it', async ({
  page,
}) => {
  const admin = seededAdmin();
  await signIn(page, admin.email, admin.password);
  const nav = page.getByRole('navigation', { name: 'Main' });

  // Create today's Sunday service.
  await nav.getByRole('link', { name: 'Services' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading services' })).toHaveCount(0);
  await page.getByRole('button', { name: 'New Service' }).click();
  const serviceDialog = page.getByRole('dialog', { name: 'New Service' });
  await serviceDialog.getByLabel('Date *').fill(new Date().toISOString().slice(0, 10));
  await serviceDialog.getByLabel('Type *').selectOption('sunday_service');
  await serviceDialog.getByLabel('Title').fill(SERVICE_TITLE);
  await serviceDialog.getByRole('button', { name: 'Create Service' }).click();
  await expect(serviceDialog).toHaveCount(0);

  // Mark the member and the admin present, with the keyboard, then save.
  await page.getByRole('button', { name: new RegExp(`^Attendance for ${SERVICE_TITLE}`) }).click();
  const sheet = page.getByRole('dialog', { name: new RegExp(`^Attendance: ${SERVICE_TITLE}`) });
  const filter = sheet.getByLabel('Filter members');
  await expect(filter).toBeVisible();
  await expect(sheet.getByRole('checkbox').first()).toBeVisible();
  await expectNoSeriousA11yViolations(page, '/services with the attendance sheet');
  for (const name of [E2E_MEMBER.name, adminName]) {
    await filter.fill(name);
    const box = sheet.getByRole('checkbox', { name, exact: true });
    await box.focus();
    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
  }
  await filter.fill('');
  await expect(sheet.getByRole('group', { name: /^Present: 2 of \d+ members$/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Save Attendance' }).click();
  await expect(sheet.getByRole('status')).toHaveText('Attendance saved: 2 present, 0 absent.');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);

  // The staff view of the member's profile: the Attendance tab lists the service.
  await page.goto(`/members/${memberId}`);
  await page.getByRole('tab', { name: 'Attendance' }).click();
  await expect(page.getByText(/attended 1 of \d+ Sunday Service services/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Services attended' })).toContainText(SERVICE_TITLE);
  await expectNoSeriousA11yViolations(page, '/members/[id] on the Attendance tab');

  // The refresh job runs to completion from the analytics page.
  await nav.getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByRole('status', { name: 'Loading analytics' })).toHaveCount(0);
  const [started] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/api/analytics/members/engagement/refresh-all') && r.ok(),
    ),
    page.getByRole('button', { name: 'Refresh Scores' }).click(),
  ]);
  const { jobId } = (await started.json()) as { jobId: string };
  await expect(
    page.getByRole('status').filter({ hasText: /^Engagement scores refreshed for \d+ of \d+/ }),
  ).toBeVisible({ timeout: 60_000 });
  const job = await page.request.get(`/api/analytics/jobs/${jobId}`);
  expect(((await job.json()) as { status: string }).status).toBe('completed');

  // This month's snapshot counts the service, and the ranking on the page shows that score.
  const trends = await page.request.get(`/api/analytics/members/${memberId}/trends?months=1`);
  const latest = (
    (await trends.json()) as {
      trends: { attendanceScore: number; engagementScore: number }[];
    }
  ).trends.at(-1);
  expect(latest?.attendanceScore).toBeGreaterThan(0);
  // The member's row in the ranking: the nearest element around the name that has a score.
  const ranking = page
    .getByRole('heading', { name: 'Most Engaged Members' })
    .locator('xpath=../..');
  const row = ranking
    .getByText(E2E_MEMBER.name, { exact: true })
    .locator('xpath=ancestor::div[.//span[contains(., "%")]][1]');
  await expect(row).toContainText(`${latest?.engagementScore}%`);

  // The member sees the same service in their own attendance section.
  await page.context().clearCookies();
  await signIn(page, E2E_MEMBER.email, E2E_MEMBER.password);
  await page.goto(`/members/${memberId}`);
  const own = page.getByRole('region', { name: 'Your Attendance' });
  await expect(own.getByText(/^You attended 1 of \d+ Sunday Service services/)).toBeVisible();
  await expect(own.getByRole('list', { name: 'Services attended' })).toContainText(SERVICE_TITLE);
  await expectNoSeriousA11yViolations(page, 'a member on their own profile');
});
