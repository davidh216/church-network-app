import type { EngagementJob } from '@embrace/shared';
import type { ApiEnvelope, MemberAnalytics } from '@/types/domain';
import { apiFetch } from './client';

/** Staff only. */
export async function getAnalytics(): Promise<MemberAnalytics> {
  const data = await apiFetch<ApiEnvelope<{ analytics: MemberAnalytics }>>('/analytics/members');
  return data.analytics;
}

function toJob(data: EngagementJob): EngagementJob {
  const { jobId, status, processed, failed, skipped, total, startedAt, finishedAt } = data;
  return { jobId, status, processed, failed, skipped, total, startedAt, finishedAt };
}

/**
 * Staff only: starts the background job that recomputes engagement for every account (the API
 * answers 202 at once), or returns the job already running. Poll it with getEngagementJob.
 */
export async function refreshAllEngagement(): Promise<EngagementJob> {
  const data = await apiFetch<ApiEnvelope<EngagementJob>>(
    '/analytics/members/engagement/refresh-all',
    { method: 'POST' },
  );
  return toJob(data);
}

/** Staff only: a refresh job's progress. 404 once the API has restarted (jobs live in memory). */
export async function getEngagementJob(id: string): Promise<EngagementJob> {
  const data = await apiFetch<ApiEnvelope<EngagementJob>>(
    `/analytics/jobs/${encodeURIComponent(id)}`,
  );
  return toJob(data);
}
