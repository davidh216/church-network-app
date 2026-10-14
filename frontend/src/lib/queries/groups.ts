import type {
  AddGroupMemberInput,
  CreateGroupInput,
  UpdateGroupInput,
  UpdateGroupMemberInput,
} from '@embrace/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroup,
  listGroups,
  listOwnGroups,
  removeGroupMember,
  updateGroup,
  updateGroupMember,
  type GroupListParams,
} from '@/lib/api/groups';
import { queryKeys } from './keys';

/** The directory (member or staff shape, as the API decides); the previous list stays while filters change. */
export function useGroups(params: GroupListParams = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.groups.list(params),
    queryFn: ({ signal }) => listGroups(params, signal),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

/** The signed-in user's own memberships. */
export function useOwnGroups() {
  return useQuery({
    queryKey: queryKeys.groups.mine(),
    queryFn: ({ signal }) => listOwnGroups(signal),
  });
}

/** One group: the public fields, plus the roster for staff. */
export function useGroup(id: string) {
  return useQuery({
    queryKey: queryKeys.groups.detail(id),
    queryFn: ({ signal }) => getGroup(id, signal),
  });
}

/**
 * A group or roster change refetches every group query, the staff profiles that list
 * memberships, the member lists (group filters) and the audit log (every group write is audited).
 */
function invalidateGroups(queryClient: QueryClient, deletedId?: string) {
  // A deleted group's cached page is dropped, not refetched: a stale copy must never show it as
  // live (on Back, or from an old link), and a refetch would only flash a 404.
  if (deletedId)
    queryClient.removeQueries({ queryKey: queryKeys.groups.detail(deletedId), exact: true });
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.groups.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.memberDetails.all }),
    // Member lists show and filter by group membership.
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.audit.all }),
  ]);
}

/** Staff only. */
export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroupInput) => createGroup(input),
    onSuccess: () => invalidateGroups(queryClient),
  });
}

/** Staff only: edit, archive (`isActive: false`) or restore. */
export function useUpdateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateGroupInput }) => updateGroup(id, input),
    onSuccess: () => invalidateGroups(queryClient),
  });
}

/** Admin only: deletes the group and its roster. */
export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteGroup(id),
    onSuccess: (_, id) => invalidateGroups(queryClient, id),
  });
}

/** Staff only. An existing membership rejects with the API's 409 CONFLICT. */
export function useAddGroupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, input }: { groupId: string; input: AddGroupMemberInput }) =>
      addGroupMember(groupId, input),
    onSuccess: () => invalidateGroups(queryClient),
  });
}

/** Staff only: a member's role or active flag. */
export function useUpdateGroupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      userId,
      input,
    }: {
      groupId: string;
      userId: string;
      input: UpdateGroupMemberInput;
    }) => updateGroupMember(groupId, userId, input),
    onSuccess: () => invalidateGroups(queryClient),
  });
}

/** Staff only. */
export function useRemoveGroupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      removeGroupMember(groupId, userId),
    onSuccess: () => invalidateGroups(queryClient),
  });
}
