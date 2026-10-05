import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '@/components/dashboard/Dashboard';
import { summaryTiles } from '@/components/dashboard/SummaryTiles';
import AppShell from '@/components/layout/AppShell';
import { isCurrent, navItems } from '@/components/layout/AppNav';
import { ApiError } from '@/lib/api/client';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { render, settle } from '@/test/render';
import type { User } from '@/types/domain';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: '/', search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const authApi = vi.hoisted(() => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => authApi);

const usersApi = vi.hoisted(() => ({ getUserSummary: vi.fn() }));
vi.mock('@/lib/api/users', () => usersApi);

const staffSummary = { total: 12, active: 10, pendingApproval: 2, newThisMonth: 3 };

async function renderDashboard(roleNames: string[], overrides: Partial<User> = {}) {
  authApi.me.mockResolvedValue(makeUser(roleNames, overrides));
  const { container } = await render(
    <AuthProvider>
      <AppShell>
        <Dashboard />
      </AppShell>
    </AuthProvider>,
  );
  await settle();
  return container;
}

function links(container: HTMLElement): Array<[string, string | null]> {
  return Array.from(container.querySelectorAll('a')).map((a) => [
    (a.textContent ?? '').trim(),
    a.getAttribute('href'),
  ]);
}

function linkTexts(container: HTMLElement, selector = 'a'): string[] {
  return Array.from(container.querySelectorAll(selector)).map((a) => (a.textContent ?? '').trim());
}

beforeEach(() => {
  vi.resetAllMocks();
  nav.pathname = '/';
  nav.search = '';
  usersApi.getUserSummary.mockResolvedValue({ total: 7 });
});

describe('app shell', () => {
  it('shows the header, navigation and profile card to a member, without Analytics', async () => {
    const container = await renderDashboard(['member']);
    expect(container.textContent).toContain('Welcome back, Ann Example!');
    expect(container.textContent).toContain('Your Profile');
    expect(linkTexts(container, 'nav a')).toEqual(['Dashboard', 'Members', 'Media', 'My Profile']);
    expect(linkTexts(container)).not.toContain('Member Analytics');
    expect(container.querySelector('nav a[aria-current="page"]')?.textContent).toBe('Dashboard');
  });

  it('links staff to Analytics from the navigation and the quick links', async () => {
    usersApi.getUserSummary.mockResolvedValue(staffSummary);
    const container = await renderDashboard(['admin']);
    expect(linkTexts(container, 'nav a')).toContain('Analytics');
    expect(links(container)).toEqual(
      expect.arrayContaining([
        ['View Members', '/members'],
        ['Media Library', '/media'],
        ['Member Analytics', '/analytics'],
        ['My Profile', '/members/cluser0000000000000000001'],
      ]),
    );
  });

  it('starts with a skip link to the focusable main region', async () => {
    usersApi.getUserSummary.mockResolvedValue(staffSummary);
    const container = await renderDashboard(['member']);
    const skip = container.querySelector('a')!;
    expect(skip.textContent).toBe('Skip to main content');
    expect(skip.getAttribute('href')).toBe('#main-content');
    const main = container.querySelector('main#main-content')!;
    expect(main.getAttribute('tabindex')).toBe('-1');
  });

  it('marks My Profile, not Members, as current on the own profile page', async () => {
    nav.pathname = '/members/cluser0000000000000000001';
    const container = await renderDashboard(['member']);
    expect(container.querySelector('nav a[aria-current="page"]')?.textContent).toBe('My Profile');
  });

  it('shows "The server is unavailable" when me() fails; Retry asks again', async () => {
    authApi.me.mockRejectedValueOnce(new TypeError('fetch failed'));
    authApi.me.mockRejectedValueOnce(new ApiError(502, 'Bad Gateway'));
    authApi.me.mockResolvedValueOnce(makeUser(['member']));
    const { container } = await render(
      <AuthProvider>
        <AppShell>
          <Dashboard />
        </AppShell>
      </AuthProvider>,
    );
    const retry = () =>
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Retry');
    expect(container.textContent).toContain('The server is unavailable');
    expect(container.textContent).not.toContain('signed out');

    await act(async () => retry()?.click());
    await settle();
    expect(authApi.me).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('The server is unavailable');

    await act(async () => retry()?.click());
    await settle();
    expect(authApi.me).toHaveBeenCalledTimes(3);
    expect(container.textContent).not.toContain('The server is unavailable');
    expect(container.textContent).toContain('Your Profile');
  });

  it('offers a sign-in link when the API says the session is gone', async () => {
    authApi.me.mockRejectedValue(new ApiError(403, 'Forbidden'));
    const { container } = await render(
      <AuthProvider>
        <AppShell>
          <p>secret page</p>
        </AppShell>
      </AuthProvider>,
    );
    expect(container.textContent).toContain('You are signed out.');
    expect(container.textContent).not.toContain('secret page');
  });

  it('Logout calls the API and routes to /login', async () => {
    authApi.logout.mockResolvedValue(undefined);
    const container = await renderDashboard(['member']);
    const logout = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Logout',
    );
    await act(async () => logout?.click());
    await settle();
    expect(authApi.logout).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/login');
  });
});

describe('dashboard', () => {
  it('shows the staff counts from /api/users/summary', async () => {
    usersApi.getUserSummary.mockResolvedValue(staffSummary);
    const container = await renderDashboard(['leader']);
    const tiles = Array.from(container.querySelectorAll('dl > div')).map((d) => d.textContent);
    expect(tiles).toEqual(['Total members12', 'Active10', 'Pending approval2', 'New this month3']);
  });

  it('shows a member a single Members tile', async () => {
    const container = await renderDashboard(['member']);
    const tiles = Array.from(container.querySelectorAll('dl > div')).map((d) => d.textContent);
    expect(tiles).toEqual(['Members7']);
  });

  it('reports a failed summary with a retry', async () => {
    usersApi.getUserSummary.mockRejectedValueOnce(new ApiError(500, 'Boom'));
    const container = await renderDashboard(['member']);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Boom');
    const retry = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Retry',
    );
    await act(async () => retry?.click());
    await settle();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('Members7');
  });

  it('shows "Member since" only with a real membership date, never the account date', async () => {
    const without = await renderDashboard(['member']);
    expect(without.textContent).not.toContain('Member since');
    expect(without.textContent).not.toContain('Not set');
  });

  it('shows the membership date in the browser locale when there is one', async () => {
    const container = await renderDashboard(['member'], {
      membershipDate: '2020-03-15T12:00:00.000Z',
    });
    expect(container.textContent).toContain(
      `Member since: ${new Date('2020-03-15T12:00:00.000Z').toLocaleDateString()}`,
    );
  });

  it('has no placeholder actions or hard-coded overview', async () => {
    const container = await renderDashboard(['admin']);
    const text = container.textContent ?? '';
    expect(text).not.toContain('Upcoming Events');
    expect(text).not.toContain('Slack Workspace');
    expect(text).not.toContain('Membership Overview');
    expect(text).not.toContain('Active System');
  });

  it('shows the staff-only notice from the redirect and dismisses it', async () => {
    nav.search = 'notice=staff-only';
    const container = await renderDashboard(['member']);
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain('That page is only available to staff.');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss notice"]')!.click(),
    );
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('ignores unknown notice codes', async () => {
    nav.search = 'notice=%3Cb%3Ehi%3C%2Fb%3E';
    const container = await renderDashboard(['member']);
    expect(container.querySelector('button[aria-label="Dismiss notice"]')).toBeNull();
    expect(container.textContent).not.toContain('<b>');
  });
});

describe('navigation helpers', () => {
  it('matches a section and its children, and the dashboard only exactly', () => {
    expect(isCurrent('/members/x', '/members')).toBe(true);
    expect(isCurrent('/membersx', '/members')).toBe(false);
    expect(isCurrent('/media', '/')).toBe(false);
    expect(isCurrent('/', '/')).toBe(true);
  });

  it('lists Analytics for staff only', () => {
    expect(navItems(false, 'u1').map((i) => i.href)).toEqual([
      '/',
      '/members',
      '/media',
      '/members/u1',
    ]);
    expect(navItems(true, 'u1').map((i) => i.href)).toContain('/analytics');
  });

  it('turns a member summary into one tile and a staff summary into four', () => {
    expect(summaryTiles({ total: 3 })).toEqual([{ label: 'Members', value: 3 }]);
    expect(summaryTiles(staffSummary)).toHaveLength(4);
  });
});
