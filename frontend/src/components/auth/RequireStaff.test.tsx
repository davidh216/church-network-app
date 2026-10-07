import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsPage from '@/app/(app)/analytics/page';
import ServicesRoute from '@/app/(app)/services/page';
import RequireStaff from '@/components/auth/RequireStaff';
import MemberProfileRoute from '@/components/members/MemberProfileRoute';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { makeUser } from '@/test/fixtures';
import { render } from '@/test/render';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const authApi = vi.hoisted(() => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => authApi);

const detailsApi = vi.hoisted(() => ({
  getMemberDetails: vi.fn(),
  getOwnAttendance: vi.fn(),
  getMemberAttendance: vi.fn(),
}));
vi.mock('@/lib/api/memberDetails', () => detailsApi);

const analyticsApi = vi.hoisted(() => ({ getAnalytics: vi.fn(), refreshAllEngagement: vi.fn() }));
vi.mock('@/lib/api/analytics', () => analyticsApi);

const servicesApi = vi.hoisted(() => ({ listServices: vi.fn() }));
vi.mock('@/lib/api/services', () => servicesApi);

const SELF = 'cluser0000000000000000001';
const OTHER = 'cluser0000000000000000002';

async function renderAs(roleNames: string[], ui: React.ReactNode) {
  authApi.me.mockResolvedValue(makeUser(roleNames, { phone: '555-0100' }));
  const { container } = await render(<AuthProvider>{ui}</AuthProvider>);
  return container;
}

beforeEach(() => {
  vi.resetAllMocks();
  detailsApi.getMemberDetails.mockResolvedValue({
    ...makeUser(['member'], { id: OTHER, name: 'Bob Other' }),
    engagement: null,
  });
  detailsApi.getOwnAttendance.mockResolvedValue({
    months: 12,
    from: '2025-10-06',
    to: '2026-10-05',
    types: ['sunday_service'],
    serviceCount: 4,
    attendedCount: 1,
    attended: [{ id: 's1', date: '2026-10-04', type: 'sunday_service', title: null }],
  });
  analyticsApi.getAnalytics.mockRejectedValue(new Error('not needed'));
});

describe('RequireStaff', () => {
  it('renders the page for staff', async () => {
    const container = await renderAs(['leader'], <RequireStaff>staff page</RequireStaff>);
    expect(container.textContent).toBe('staff page');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('sends a member to the dashboard with the staff-only notice', async () => {
    const container = await renderAs(['member'], <RequireStaff>staff page</RequireStaff>);
    expect(container.textContent).toBe('');
    expect(router.replace).toHaveBeenCalledWith('/?notice=staff-only');
  });

  it('lets the allowed user through', async () => {
    const container = await renderAs(
      ['member'],
      <RequireStaff allowUserId={SELF}>own page</RequireStaff>,
    );
    expect(container.textContent).toBe('own page');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('renders nothing and does not redirect while the user is unknown', async () => {
    authApi.me.mockReturnValue(new Promise(() => undefined));
    const { container } = await render(
      <AuthProvider>
        <RequireStaff>staff page</RequireStaff>
      </AuthProvider>,
    );
    expect(container.textContent).toBe('');
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('/analytics', () => {
  it('redirects a member without asking the API', async () => {
    await renderAs(['member'], <AnalyticsPage />);
    expect(router.replace).toHaveBeenCalledWith('/?notice=staff-only');
    expect(analyticsApi.getAnalytics).not.toHaveBeenCalled();
  });

  it('loads the dashboard for staff, with a retry instead of a close button on failure', async () => {
    const container = await renderAs(['admin'], <AnalyticsPage />);
    await waitFor(() => expect(container.textContent).toContain('not needed'));
    expect(analyticsApi.getAnalytics).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Retry');
    expect(container.textContent).not.toContain('Close');
  });
});

describe('/services', () => {
  it('redirects a member without asking the API', async () => {
    await renderAs(['member'], <ServicesRoute />);
    expect(router.replace).toHaveBeenCalledWith('/?notice=staff-only');
    expect(servicesApi.listServices).not.toHaveBeenCalled();
  });

  it('lists the month for a leader', async () => {
    servicesApi.listServices.mockResolvedValue({ services: [], total: 0, page: 1, pageSize: 100 });
    const container = await renderAs(['leader'], <ServicesRoute />);
    await waitFor(() => expect(container.textContent).toContain('No services in'));
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('/members/[id]', () => {
  it('shows staff the full profile with a link back to the list', async () => {
    const container = await renderAs(['admin'], <MemberProfileRoute id={OTHER} />);
    await waitFor(() => expect(container.querySelector('h1')?.textContent).toBe('Bob Other'));
    expect(detailsApi.getMemberDetails).toHaveBeenCalledWith(OTHER);
    expect(container.querySelector('a[href="/members"]')).not.toBeNull();
    expect(container.querySelector('.fixed')).toBeNull();
  });

  it('shows a member their own profile without the staff-only details call', async () => {
    const container = await renderAs(['member'], <MemberProfileRoute id={SELF} />);
    expect(container.querySelector('h1')?.textContent).toBe('Ann Example');
    expect(container.textContent).toContain('555-0100');
    expect(detailsApi.getMemberDetails).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    // Their own attendance comes from /me/attendance, never the staff endpoint.
    await waitFor(() => expect(container.textContent).toContain('You attended 1 of 4'));
    expect(detailsApi.getOwnAttendance).toHaveBeenCalled();
    expect(detailsApi.getMemberAttendance).not.toHaveBeenCalled();
  });

  it("sends a member opening someone else's profile to the dashboard", async () => {
    const container = await renderAs(['member'], <MemberProfileRoute id={OTHER} />);
    expect(container.textContent).toBe('');
    expect(router.replace).toHaveBeenCalledWith('/?notice=staff-only');
    expect(detailsApi.getMemberDetails).not.toHaveBeenCalled();
  });
});
