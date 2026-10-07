import { expect, test, type Page } from '@playwright/test';
import { seededAdmin } from './admin';
import {
  adminRequest,
  deleteServices,
  E2E_MEMBER,
  ensureE2eMember,
  freeServiceDate,
  refreshEngagement,
} from './api';
import { expectNoSeriousA11yViolations } from './axe';

// The attendance flow (PHASE3_SPECS.md D8): staff create a service and mark two members present,
// both profiles show it, and the engagement refresh job brings it into the analytics. The admin
// then deletes the service (with its attendance) in the UI and the scores are refreshed again, so
// no services or attendance are left behind. church_dev does not end as it started: each refresh
// recalculates every account's stored engagement row and creates or updates this month's
// engagement snapshot for every account. Service dates are calendar days and the API counts UTC
// days, so the browser runs in UTC too.
test.use({ timezoneId: 'UTC' });
// Two sign-ins, a refresh job and a delete on dev servers that compile each route on first use.
test.setTimeout(120_000);

const SERVICE_TITLE = 'E2E Attendance Service';
let memberId = '';
let adminName = '';
// The most recent UTC day with no Sunday service, so other data in church_dev cannot cause a 409.
let serviceDate = '';

test.beforeAll(async () => {
  const admin = await adminRequest();
  await deleteServices(admin, SERVICE_TITLE);
  serviceDate = await freeServiceDate(admin, 'sunday_service');
  memberId = (await ensureE2eMember(admin)).id;
  const me = await admin.get('/api/auth/me');
  expect(me.ok()).toBe(true);
  adminName = ((await me.json()) as { user: { name: string } }).user.name;
  await admin.dispose();
});

// A fallback only: the test deletes its service through the UI. The refresh must succeed.
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

  // Create a Sunday service on the free day.
  await nav.getByRole('link', { name: 'Services' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading services' })).toHaveCount(0);
  await page.getByRole('button', { name: 'New Service' }).click();
  const serviceDialog = page.getByRole('dialog', { name: 'New Service' });
  await serviceDialog.getByLabel('Date *').fill(serviceDate);
  await serviceDialog.getByLabel('Type *').selectOption('sunday_service');
  await serviceDialog.getByLabel('Title').fill(SERVICE_TITLE);
  await serviceDialog.getByRole('button', { name: 'Create Service' }).click();
  // A server error (such as a 409 for a taken day) would show here and keep the dialog open.
  await expect(serviceDialog.getByRole('alert')).toHaveCount(0);
  await expect(serviceDialog).toHaveCount(0);

  // Mark the member and the admin present, with the keyboard (Tab from the filter), then save.
  await page.getByRole('button', { name: new RegExp(`^Attendance for ${SERVICE_TITLE}`) }).click();
  const sheet = page.getByRole('dialog', { name: new RegExp(`^Attendance: ${SERVICE_TITLE}`) });
  const filter = sheet.getByLabel('Filter members');
  await expect(filter).toBeVisible();
  await expect(sheet.getByRole('checkbox').first()).toBeVisible();
  await expectNoSeriousA11yViolations(page, '/services with the attendance sheet');
  for (const name of [E2E_MEMBER.name, adminName]) {
    await filter.fill(name);
    const box = sheet.getByRole('checkbox', { name, exact: true });
    await expect(box).toBeVisible();
    // The bulk buttons come first after the filter; the checkbox is a later Tab stop.
    for (let stop = 0; stop < 5; stop += 1) {
      if (await box.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(box).toBeFocused();
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
  await expect(page.getByText(/could not be refreshed/)).toHaveCount(0);
  const job = await page.request.get(`/api/analytics/jobs/${jobId}`);
  expect(await job.json()).toMatchObject({ status: 'completed', failed: 0 });

  // This month's snapshot counts the service, and the member's Church Info tab shows that score.
  const trends = await page.request.get(`/api/analytics/members/${memberId}/trends?months=1`);
  const latest = (
    (await trends.json()) as {
      trends: {
        attendanceScore: number;
        communityScore: number;
        communicationScore: number;
        engagementScore: number;
      }[];
    }
  ).trends.at(-1);
  expect(latest?.attendanceScore).toBeGreaterThan(0);
  if (!latest) throw new Error('No engagement snapshot for this month');
  await page.goto(`/members/${memberId}`);
  await page.getByRole('tab', { name: 'Church Info' }).click();
  const churchInfo = page.getByRole('tabpanel');
  await expect(
    churchInfo.getByText(`${Math.round(latest.engagementScore)}/100`, { exact: true }),
  ).toBeVisible();
  const components = churchInfo.getByRole('region', { name: 'Score components' });
  await expect(components.getByRole('term')).toHaveText([
    /^Attendance/,
    /^Community/,
    /^Communication/,
  ]);
  await expect(components.getByRole('definition')).toHaveText(
    [latest.attendanceScore, latest.communityScore, latest.communicationScore].map(
      (score) => new RegExp(`^${Math.round(score)}/100`),
    ),
  );
  await expectNoSeriousA11yViolations(page, '/members/[id] on the Church Info tab');

  // The member sees the same service in their own attendance section.
  await page.context().clearCookies();
  await signIn(page, E2E_MEMBER.email, E2E_MEMBER.password);
  await page.goto(`/members/${memberId}`);
  const own = page.getByRole('region', { name: 'Your Attendance' });
  await expect(own.getByText(/^You attended 1 of \d+ Sunday Service services/)).toBeVisible();
  await expect(own.getByRole('list', { name: 'Services attended' })).toContainText(SERVICE_TITLE);
  await expectNoSeriousA11yViolations(page, 'a member on their own profile');

  // The admin deletes the service, and its attendance, from /services.
  await page.context().clearCookies();
  await signIn(page, admin.email, admin.password);
  await page.goto('/services');
  const heading = page.getByRole('heading', { level: 1, name: 'Services' });
  await expect(heading).toBeVisible();
  if (serviceDate.slice(0, 7) !== new Date().toISOString().slice(0, 7)) {
    await page.getByRole('button', { name: /^Previous month/ }).click();
  }
  await expect(page.getByRole('status', { name: 'Loading services' })).toHaveCount(0);
  await page
    .getByRole('button', { name: new RegExp(`^Delete ${SERVICE_TITLE} \\(Sunday Service\\) on `) })
    .click();
  const confirm = page.getByRole('dialog', { name: 'Delete Service?' });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expectNoSeriousA11yViolations(page, '/services with the Delete Service dialog');
  await confirm.getByRole('button', { name: 'Delete Service' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('cell', { name: SERVICE_TITLE, exact: true })).toHaveCount(0);
  await expect(heading).toBeFocused();
});
