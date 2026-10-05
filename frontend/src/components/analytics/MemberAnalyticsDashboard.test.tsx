import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MemberAnalyticsDashboard from '@/components/analytics/MemberAnalyticsDashboard';
import { ApiError } from '@/lib/api/client';
import { render } from '@/test/render';
import type { MemberAnalytics } from '@/types/domain';

const analyticsApi = vi.hoisted(() => ({ getAnalytics: vi.fn(), refreshAllEngagement: vi.fn() }));
vi.mock('@/lib/api/analytics', () => analyticsApi);

const analytics: MemberAnalytics = {
  totalMembers: 42,
  activeMembers: 40,
  newMembersThisMonth: 3,
  atRiskMembers: 5,
  averageEngagementScore: 61,
  topEngagedMembers: Array.from({ length: 10 }, (_, i) => ({
    user: { id: `u${i}`, name: `Member ${i}`, email: `m${i}@example.com` },
    engagementScore: 90 - i,
    membershipStage: 'core_member',
  })),
  membershipStageDistribution: { core_member: 30, at_risk: 5 },
  riskLevelDistribution: { low: 35, high: 5 },
};

beforeEach(() => vi.resetAllMocks());

describe('MemberAnalyticsDashboard', () => {
  it('renders the stat tiles, the top eight members and both distributions', async () => {
    analyticsApi.getAnalytics.mockResolvedValue(analytics);
    await render(<MemberAnalyticsDashboard />);
    expect(await screen.findByRole('heading', { name: 'Member Analytics Dashboard' })).toBeTruthy();
    expect(screen.getByText('Total Members').nextSibling?.textContent).toBe('42');
    expect(screen.getByText('Avg Engagement').nextSibling?.textContent).toBe('61%');

    const top = screen
      .getByRole('heading', { name: 'Most Engaged Members' })
      .closest('div')!.parentElement!;
    expect(within(top).getByText('Member 7')).toBeTruthy();
    expect(within(top).queryByText('Member 8')).toBeNull();

    expect(screen.getByText('At Risk', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('High Risk')).toBeTruthy();
    expect(screen.getByText('35')).toBeTruthy();
  });

  it('shows an inline error with Retry when analytics fail', async () => {
    analyticsApi.getAnalytics.mockRejectedValue(new ApiError(500, 'INTERNAL', 'Boom'));
    await render(<MemberAnalyticsDashboard />);
    expect(await screen.findByRole('button', { name: /Retry/ })).toBeTruthy();
  });
});
