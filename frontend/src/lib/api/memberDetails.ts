import type {
  ListTimelineParams,
  MemberAttendanceParams,
  MemberAttendanceSummary,
  TimelineItem,
} from '@embrace/shared';
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

/** The `?months&types` query of the attendance summaries (types as a comma-separated list). */
function attendanceQuery({ months, types }: MemberAttendanceParams): string {
  return queryString({ months, types: types?.join(',') });
}

/**
 * Staff only: the services of the scoring types a member attended in the last `months` months
 * (12 by default), and how many such services were held.
 */
export async function getMemberAttendance(
  id: string,
  params: MemberAttendanceParams = {},
  signal?: AbortSignal,
): Promise<MemberAttendanceSummary> {
  const data = await apiFetch<ApiEnvelope<{ attendance: MemberAttendanceSummary }>>(
    `/member-details/${encodeURIComponent(id)}/attendance${attendanceQuery(params)}`,
    { signal },
  );
  return data.attendance;
}

/** Any signed-in user: their own attendance summary. */
export async function getOwnAttendance(
  params: MemberAttendanceParams = {},
  signal?: AbortSignal,
): Promise<MemberAttendanceSummary> {
  const data = await apiFetch<ApiEnvelope<{ attendance: MemberAttendanceSummary }>>(
    `/member-details/me/attendance${attendanceQuery(params)}`,
    { signal },
  );
  return data.attendance;
}
