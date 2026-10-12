import type {
  AddGroupMemberInput,
  CreateGroupInput,
  GroupRosterEntry,
  GroupSummary,
  ListGroupsQuery,
  OwnGroupMembership,
  StaffGroupDetail,
  StaffGroupSummary,
  UpdateGroupInput,
  UpdateGroupMemberInput,
} from '@embrace/shared';
import type { ApiEnvelope } from '@/types/domain';
import { apiFetch } from './client';
import { queryString } from './query';

/** Directory filters (`status` is staff-only; members only ever get active groups). */
export type GroupListParams = Pick<ListGroupsQuery, 'type' | 'status'>;

/**
 * GET /api/groups: the directory by name. Members get active groups with public fields and
 * leader names; staff also get archived groups (`status`) and member counts.
 */
export async function listGroups(
  params: GroupListParams = {},
  signal?: AbortSignal,
): Promise<Array<GroupSummary | StaffGroupSummary>> {
  const data = await apiFetch<ApiEnvelope<{ groups: Array<GroupSummary | StaffGroupSummary> }>>(
    `/groups${queryString(params)}`,
    { signal },
  );
  return data.groups;
}

/** GET /api/groups?mine=true: the caller's own active memberships with their roles. */
export async function listOwnGroups(signal?: AbortSignal): Promise<OwnGroupMembership[]> {
  const data = await apiFetch<ApiEnvelope<{ memberships: OwnGroupMembership[] }>>(
    '/groups?mine=true',
    { signal },
  );
  return data.memberships;
}

const groupPath = (id: string) => `/groups/${encodeURIComponent(id)}`;

/** GET /api/groups/:id: the public fields, plus the roster for staff. 404 for members on archived groups. */
export async function getGroup(
  id: string,
  signal?: AbortSignal,
): Promise<GroupSummary | StaffGroupDetail> {
  const data = await apiFetch<ApiEnvelope<{ group: GroupSummary | StaffGroupDetail }>>(
    groupPath(id),
    { signal },
  );
  return data.group;
}

/** POST /api/groups (staff). */
export async function createGroup(input: CreateGroupInput): Promise<StaffGroupSummary> {
  const data = await apiFetch<ApiEnvelope<{ group: StaffGroupSummary }>>('/groups', {
    method: 'POST',
    json: input,
  });
  return data.group;
}

/** PATCH /api/groups/:id (staff): edit, archive (`isActive: false`) or restore. */
export async function updateGroup(id: string, input: UpdateGroupInput): Promise<StaffGroupSummary> {
  const data = await apiFetch<ApiEnvelope<{ group: StaffGroupSummary }>>(groupPath(id), {
    method: 'PATCH',
    json: input,
  });
  return data.group;
}

/** DELETE /api/groups/:id (admin): also removes the roster; returns how many memberships. */
export async function deleteGroup(id: string): Promise<{ removed: number }> {
  const { removed } = await apiFetch<ApiEnvelope<{ removed: number }>>(groupPath(id), {
    method: 'DELETE',
  });
  return { removed };
}

const memberPath = (groupId: string, userId: string) =>
  `${groupPath(groupId)}/members/${encodeURIComponent(userId)}`;

/** POST /api/groups/:id/members (staff): active users only; already on the roster is a 409. */
export async function addGroupMember(
  groupId: string,
  input: AddGroupMemberInput,
): Promise<GroupRosterEntry> {
  const data = await apiFetch<ApiEnvelope<{ member: GroupRosterEntry }>>(
    `${groupPath(groupId)}/members`,
    { method: 'POST', json: input },
  );
  return data.member;
}

/** PATCH /api/groups/:id/members/:userId (staff): role or active flag. */
export async function updateGroupMember(
  groupId: string,
  userId: string,
  input: UpdateGroupMemberInput,
): Promise<GroupRosterEntry> {
  const data = await apiFetch<ApiEnvelope<{ member: GroupRosterEntry }>>(
    memberPath(groupId, userId),
    { method: 'PATCH', json: input },
  );
  return data.member;
}

/** DELETE /api/groups/:id/members/:userId (staff). */
export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  await apiFetch<ApiEnvelope<object>>(memberPath(groupId, userId), { method: 'DELETE' });
}
