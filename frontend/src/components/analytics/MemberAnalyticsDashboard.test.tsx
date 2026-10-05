import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MemberAnalyticsDashboard from '@/components/analytics/MemberAnalyticsDashboard';
import { ApiError } from '@/lib/api/client';
import { render } from '@/test/render';
import type { MemberAnalytics } from '@/types/domain';
import type { EngagementJob } from '@embrace/shared';

const analyticsApi = vi.hoisted(() => ({
  getAnalytics: vi.fn(),
  refreshAllEngagement: vi.fn(),
  getEngagementJob: vi.fn(),
}));
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
    expect(screen.getByText('High Risk', { selector: 'span' })).toBeTruthy();
    // The tile counts high-risk active members (the "high" bucket), not medium risk.
    expect(screen.getByText('High Risk', { selector: 'p' }).nextSibling?.textContent).toBe('5');
    expect(screen.getByText('Active members whose risk level is high')).toBeTruthy();
    expect(screen.getByText('35')).toBeTruthy();
  });

  it('shows the average of each engagement component with its help text', async () => {
    analyticsApi.getAnalytics.mockResolvedValue({
      ...analytics,
      averageScores: {
        engagementScore: 61,
        attendanceScore: 70,
        communityScore: 45,
        communicationScore: 52,
      },
    });
    await render(<MemberAnalyticsDashboard />);
    const section = await screen.findByRole('region', { name: /Average engagement components/ });
    expect(within(section).getByText('Attendance').closest('div')?.textContent).toContain('70/100');
    expect(within(section).getByText('Community').closest('div')?.textContent).toContain('45/100');
    expect(within(section).getByText(/Responses over asks/)).toBeTruthy();
  });

  it('leaves the component tiles out when the API sends no averages', async () => {
    analyticsApi.getAnalytics.mockResolvedValue(analytics);
    await render(<MemberAnalyticsDashboard />);
    await screen.findByRole('heading', { name: 'Member Analytics Dashboard' });
    expect(screen.queryByRole('region', { name: /Average engagement components/ })).toBeNull();
  });

  it('shows an inline error with Retry when analytics fail', async () => {
    analyticsApi.getAnalytics.mockRejectedValue(new ApiError(500, 'INTERNAL', 'Boom'));
    await render(<MemberAnalyticsDashboard />);
    expect(await screen.findByRole('button', { name: /Retry/ })).toBeTruthy();
  });
});

describe('Refresh Scores', () => {
  const job = (patch: Partial<EngagementJob> = {}): EngagementJob => ({
    jobId: 'job-1',
    status: 'running',
    processed: 0,
    failed: 0,
    skipped: 0,
    total: 3,
    startedAt: '2026-10-05T10:00:00.000Z',
    finishedAt: null,
    ...patch,
  });

  it('shows the job progress and refetches the analytics once the job completes', async () => {
    analyticsApi.getAnalytics.mockResolvedValue(analytics);
    analyticsApi.refreshAllEngagement.mockResolvedValue(job({ processed: 1 }));
    analyticsApi.getEngagementJob.mockResolvedValue(job({ status: 'completed', processed: 3 }));
    await render(<MemberAnalyticsDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh Scores' }));

    const progress = await screen.findByRole('button', { name: 'Refreshing 1/3' });
    expect(progress).toBeDisabled();
    expect(screen.getByRole('status').textContent).toBe(
      'Refreshing engagement scores: 1 of 3 members done.',
    );
    expect(analyticsApi.getAnalytics).toHaveBeenCalledTimes(1);

    await waitFor(
      () =>
        expect(screen.getByRole('status').textContent).toBe(
          'Engagement scores refreshed for 3 of 3 members.',
        ),
      { timeout: 3000 },
    );
    expect(screen.getByRole('button', { name: 'Refresh Scores' })).toBeEnabled();
    await waitFor(() => expect(analyticsApi.getAnalytics).toHaveBeenCalledTimes(2));
    expect(analyticsApi.getEngagementJob).toHaveBeenCalledWith('job-1');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
