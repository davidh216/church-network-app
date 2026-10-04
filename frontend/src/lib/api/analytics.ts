import type { ApiEnvelope, MemberAnalytics } from '../../types/domain';
import { apiFetch } from './client';

/** Staff only. */
export async function getAnalytics(): Promise<MemberAnalytics> {
  const data = await apiFetch<ApiEnvelope<{ analytics: MemberAnalytics }>>('/analytics/members');
  return data.analytics;
}

/** Staff only: recomputes engagement scores for every active member. */
export async function refreshAllEngagement(): Promise<string> {
  const data = await apiFetch<ApiEnvelope<{ message: string }>>(
    '/analytics/members/engagement/refresh-all',
    {
      method: 'POST',
    },
  );
  return data.message;
}
