import type { ApiEnvelope, CreateUserInput, Member, UpdateUserInput } from '../../types/domain';
import { apiFetch, apiRequest } from './client';

export async function listUsers(): Promise<Member[]> {
  const data = await apiFetch<ApiEnvelope<{ users: Member[] }>>('/users');
  return data.users;
}

export async function getUser(id: string): Promise<Member> {
  const data = await apiFetch<ApiEnvelope<{ user: Member }>>(`/users/${encodeURIComponent(id)}`);
  return data.user;
}

export async function createUser(input: CreateUserInput): Promise<Member> {
  const data = await apiFetch<ApiEnvelope<{ user: Member }>>('/users', { method: 'POST', json: input });
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
