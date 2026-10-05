import type { ListUsersParams, SearchQuery } from '@embrace/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateUserInput, UpdateUserInput } from '../../types/domain';
import {
  createUser,
  getUser,
  getUserSummary,
  listUsers,
  searchUsers,
  updateUser,
} from '../api/users';
import { queryKeys } from './keys';

/**
 * One page of the member list. The previous page stays on screen while the next loads
 * (`keepPreviousData`), so typing in the search box never swaps the list for a spinner.
 */
export function useUsers(params: ListUsersParams, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => listUsers(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/**
 * Staff only: one page of the advanced search (POST /api/users/search). Idle while `query`
 * is null. The key sits under `users`, so saving a member refetches the search too.
 */
export function useMemberSearch(query: SearchQuery | null) {
  return useQuery({
    queryKey: queryKeys.users.search(query),
    queryFn: () => searchUsers(query!),
    placeholderData: keepPreviousData,
    enabled: query !== null,
  });
}

export function useUser(id: string) {
  return useQuery({ queryKey: queryKeys.users.detail(id), queryFn: () => getUser(id) });
}

/** Dashboard counts (staff get every count, members only `total`). */
export function useUserSummary() {
  return useQuery({ queryKey: queryKeys.users.summary(), queryFn: getUserSummary });
}

/** Staff only. Refetches member lists, the summary and analytics after a create. */
export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
      ]),
  });
}

/** Refetches member lists, that member's profile and analytics after an update. */
export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) => updateUser(id, input),
    onSuccess: (_user, { id }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.memberDetails.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
      ]),
  });
}
