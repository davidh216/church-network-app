import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngagementJob } from '@embrace/shared';
import RefreshEngagementControl from '@/components/analytics/RefreshEngagementControl';
import { ApiError } from '@/lib/api/client';
import { render } from '@/test/render';

const analyticsApi = vi.hoisted(() => ({
  getAnalytics: vi.fn(),
  refreshAllEngagement: vi.fn(),
  getEngagementJob: vi.fn(),
}));
vi.mock('@/lib/api/analytics', () => analyticsApi);

const job = (patch: Partial<EngagementJob> = {}): EngagementJob => ({
  jobId: 'job-1',
  status: 'running',
  processed: 0,
  failed: 0,
  skipped: 0,
  total: 4,
  startedAt: '2026-10-05T10:00:00.000Z',
  finishedAt: null,
  ...patch,
});

async function start(options = { pollMs: 5, timeoutMs: 120_000 }) {
  await render(<RefreshEngagementControl {...options} />);
  expect(screen.getByRole('status').textContent).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Scores' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  analyticsApi.refreshAllEngagement.mockResolvedValue(job());
});

describe('RefreshEngagementControl', () => {
  it('reports members that could not be refreshed when the job completes', async () => {
    analyticsApi.getEngagementJob.mockResolvedValue(
      job({ status: 'completed', processed: 4, failed: 1, skipped: 1 }),
    );
    await start();
    expect((await screen.findByRole('alert')).textContent).toBe(
      '1 of 4 members could not be refreshed.',
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Engagement scores refreshed for 2 of 4 members.',
    );
    expect(screen.getByRole('button', { name: 'Refresh Scores' })).toBeEnabled();
  });

  it('says so when the job failed', async () => {
    analyticsApi.getEngagementJob.mockResolvedValue(job({ status: 'failed' }));
    await start();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The engagement refresh failed. Some scores may not have been updated.',
    );
  });

  it('asks for a reload when the job status is gone after an API restart', async () => {
    analyticsApi.getEngagementJob.mockRejectedValue(new ApiError(404, 'Job not found'));
    await start();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The refresh status is no longer available',
    );
    expect(screen.getByRole('button', { name: 'Refresh Scores' })).toBeEnabled();
  });

  it('shows the error when the job cannot be started', async () => {
    analyticsApi.refreshAllEngagement.mockRejectedValue(new ApiError(500, 'Boom'));
    await start();
    expect((await screen.findByRole('alert')).textContent).toBe('Boom');
    expect(analyticsApi.getEngagementJob).not.toHaveBeenCalled();
  });

  it('stops waiting after the timeout and says the job is still running', async () => {
    analyticsApi.getEngagementJob.mockResolvedValue(job({ processed: 2 }));
    await start({ pollMs: 5, timeoutMs: 150 });
    expect(await screen.findByRole('button', { name: 'Refreshing 2/4' })).toBeDisabled();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The refresh is still running after 2 minutes.',
    );
    expect(screen.getByRole('button', { name: 'Refresh Scores' })).toBeEnabled();
  });
});
