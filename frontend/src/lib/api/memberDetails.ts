import type { ListTimelineParams, TimelineItem } from '@embrace/shared';
import type { ApiEnvelope, MemberDetails } from '@/types/domain';
import { apiFetch } from './client';
import { queryString, type Paged } from './query';

/** Staff only: the full CRM profile of a member. */
export async function getMemberDetails(id: string): Promise<MemberDetails> {
  const data = await apiFetch<ApiEnvelope<{ user: MemberDetails }>>(
    `/member-details/${encodeURIComponent(id)}`,
  );
  return data.user;
}

export interface TimelinePage extends Paged {
  items: TimelineItem[];
}

/**
 * Staff only: one page of the member's computed timeline (interactions, milestones, visible
 * notes and attended services), newest first.
 */
export async function getMemberTimeline(
  id: string,
  params: ListTimelineParams = {},
  signal?: AbortSignal,
): Promise<TimelinePage> {
  const { items, total, page, pageSize } = await apiFetch<ApiEnvelope<TimelinePage>>(
    `/member-details/${encodeURIComponent(id)}/timeline${queryString(params)}`,
    { signal },
  );
  return { items, total, page, pageSize };
}
