import type { CreateTagInput, Tag, TagChip, UpdateTagInput } from '@embrace/shared';
import type { ApiEnvelope } from '@/types/domain';
import { apiFetch } from './client';
import { queryString } from './query';

/** A member's tag as the assignment routes return it (archived ones have `isActive: false`). */
export interface MemberTagAssignment {
  id: string;
  addedAt: string;
  tag: TagChip & { category: Tag['category'] };
}

/** GET /api/tags (staff): tags by name with usage counts; archived ones only on request. */
export async function listTags(includeArchived = false, signal?: AbortSignal): Promise<Tag[]> {
  const data = await apiFetch<ApiEnvelope<{ tags: Tag[] }>>(
    `/tags${queryString({ includeArchived: includeArchived || undefined })}`,
    { signal },
  );
  return data.tags;
}

/** POST /api/tags (staff). A name already used in any letter case is a 409. */
export async function createTag(input: CreateTagInput): Promise<Tag> {
  const data = await apiFetch<ApiEnvelope<{ tag: Tag }>>('/tags', { method: 'POST', json: input });
  return data.tag;
}

const tagPath = (id: string) => `/tags/${encodeURIComponent(id)}`;

/** PATCH /api/tags/:id (staff): rename, recolour, recategorise, archive (`isActive: false`). */
export async function updateTag(id: string, input: UpdateTagInput): Promise<Tag> {
  const data = await apiFetch<ApiEnvelope<{ tag: Tag }>>(tagPath(id), {
    method: 'PATCH',
    json: input,
  });
  return data.tag;
}

/** DELETE /api/tags/:id (admin): also removes it from every member; returns how many. */
export async function deleteTag(id: string): Promise<{ removed: number }> {
  const { removed } = await apiFetch<ApiEnvelope<{ removed: number }>>(tagPath(id), {
    method: 'DELETE',
  });
  return { removed };
}

const memberTagsPath = (userId: string) => `/users/${encodeURIComponent(userId)}/tags`;

/** POST /api/users/:id/tags (staff): idempotent; an archived tag is refused (400). */
export async function assignTag(
  userId: string,
  tagId: string,
): Promise<{ added: boolean; memberTags: MemberTagAssignment[] }> {
  const { added, memberTags } = await apiFetch<
    ApiEnvelope<{ added: boolean; memberTags: MemberTagAssignment[] }>
  >(memberTagsPath(userId), { method: 'POST', json: { tagId } });
  return { added, memberTags };
}

/** DELETE /api/users/:id/tags/:tagId (staff). */
export async function unassignTag(
  userId: string,
  tagId: string,
): Promise<{ memberTags: MemberTagAssignment[] }> {
  const { memberTags } = await apiFetch<ApiEnvelope<{ memberTags: MemberTagAssignment[] }>>(
    `${memberTagsPath(userId)}/${encodeURIComponent(tagId)}`,
    { method: 'DELETE' },
  );
  return { memberTags };
}
