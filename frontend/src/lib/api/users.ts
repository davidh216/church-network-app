import type { ListUsersParams } from '@embrace/shared';
import type { ApiEnvelope, CreateUserInput, Member, UpdateUserInput } from '../../types/domain';
import { apiFetch, apiRequest } from './client';
import { queryString, type Paged } from './query';

export interface UserPage extends Paged {
  users: Member[];
}

/**
 * GET /api/users: one page of members matching the filters (server-side paging, 25 per
 * page by default). Members may only pass `q`, `sort=name`, `order`, `page` and `pageSize`.
 */
export async function listUsers(params: ListUsersParams = {}): Promise<UserPage> {
  const { users, total, page, pageSize } = await apiFetch<ApiEnvelope<UserPage>>(
    `/users${queryString(params)}`,
  );
  return { users, total, page, pageSize };
}

/**
 * GET /api/users/summary. Staff get every count; members get only `total`, the size of the
 * active directory they can see (Phase 2 spec 1.2).
 */
export interface UserSummary {
  total: number;
  active?: number;
  pendingApproval?: number;
  newThisMonth?: number;
}

export async function getUserSummary(): Promise<UserSummary> {
  const { total, active, pendingApproval, newThisMonth } =
    await apiFetch<ApiEnvelope<UserSummary>>('/users/summary');
  return { total, active, pendingApproval, newThisMonth };
}

export async function getUser(id: string): Promise<Member> {
  const data = await apiFetch<ApiEnvelope<{ user: Member }>>(`/users/${encodeURIComponent(id)}`);
  return data.user;
}

export async function createUser(input: CreateUserInput): Promise<Member> {
  const data = await apiFetch<ApiEnvelope<{ user: Member }>>('/users', {
    method: 'POST',
    json: input,
  });
  return data.user;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<Member> {
  const data = await apiFetch<ApiEnvelope<{ user: Member }>>(`/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    json: input,
  });
  return data.user;
}

export interface ExportedFile {
  blob: Blob;
  filename: string;
}

const DEFAULT_EXPORT_FILENAME = 'members.csv';

/** The filename from a Content-Disposition header, or the default. */
export function filenameFromDisposition(header: string | null): string {
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? DEFAULT_EXPORT_FILENAME;
}

/** Staff only: CSV export of the given members (all active members when empty). */
export async function exportUsers(memberIds: string[] = []): Promise<ExportedFile> {
  const params = new URLSearchParams({ format: 'csv' });
  if (memberIds.length) params.set('members', memberIds.join(','));
  const response = await apiRequest(`/users/export?${params.toString()}`);
  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get('Content-Disposition')),
  };
}
