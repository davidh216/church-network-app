import type { ListUsersParams, SearchQuery } from '@embrace/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateUserInput, UpdateUserInput } from '@/types/domain';
import {
  createUser,
  getUser,
  getUserSummary,
  listUsers,
  searchUsers,
  updateUser,
} from '@/lib/api/users';
import { queryKeys } from './keys';

/** What the member list shows: a GET /api/users page or a POST /api/users/search page. */
export type MemberRowsRequest =
  { kind: 'list'; params: ListUsersParams } | { kind: 'search'; query: SearchQuery };

/**
 * One page of the member list, from the list endpoint or (staff) the search endpoint. It is
 * one query whose key and fetcher follow `request`, so the previous rows stay on screen
 * (`keepPreviousData`) while a new page, filter or a switch between list and search loads;
 * the superseded request is aborted. Search keys sit under `users`, so saving a member
 * refetches them too.
 */
export function useMemberRows(request: MemberRowsRequest) {
  return useQuery({
    queryKey:
      request.kind === 'list'
        ? queryKeys.users.list(request.params)
        : queryKeys.users.search(request.query),
    queryFn: ({ signal }) =>
      request.kind === 'list'
        ? listUsers(request.params, signal)
        : searchUsers(request.query, signal),
    placeholderData: keepPreviousData,
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
