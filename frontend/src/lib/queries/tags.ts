import type { CreateTagInput, UpdateTagInput } from '@embrace/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { assignTag, createTag, deleteTag, listTags, unassignTag, updateTag } from '@/lib/api/tags';
import { queryKeys } from './keys';

/** Staff only: every tag by name (archived ones too with `includeArchived`), with usage counts. */
export function useTags(includeArchived = false, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.tags.list(includeArchived),
    queryFn: ({ signal }) => listTags(includeArchived, signal),
    enabled: options.enabled ?? true,
  });
}

/**
 * A tag change refetches the tag lists, the member rows and profiles that show tags, and the
 * audit log (every tag write is audited).
 */
function invalidateTags(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.tags.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.memberDetails.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.audit.all }),
  ]);
}

/** Staff only. A duplicate name rejects with the API's 409 CONFLICT. */
export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTagInput) => createTag(input),
    onSuccess: () => invalidateTags(queryClient),
  });
}

/** Staff only: edit, archive (`isActive: false`) or restore. */
export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTagInput }) => updateTag(id, input),
    onSuccess: () => invalidateTags(queryClient),
  });
}

/** Admin only: deletes the tag and its assignments. */
export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => invalidateTags(queryClient),
  });
}

/** Staff only: adds a tag to a member (a no-op when they already have it). */
export function useAssignTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, tagId }: { userId: string; tagId: string }) => assignTag(userId, tagId),
    onSuccess: () => invalidateTags(queryClient),
  });
}

/** Staff only: removes a tag from a member. */
export function useUnassignTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, tagId }: { userId: string; tagId: string }) =>
      unassignTag(userId, tagId),
    onSuccess: () => invalidateTags(queryClient),
  });
}
