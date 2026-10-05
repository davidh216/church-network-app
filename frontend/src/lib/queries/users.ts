import type { ListUsersParams } from '@embrace/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateUserInput, UpdateUserInput } from '../../types/domain';
import { createUser, getUser, getUserSummary, listUsers, updateUser } from '../api/users';
import { queryKeys } from './keys';

/**
 * One page of the member list. The previous page stays on screen while the next loads
 * (`keepPreviousData`), so typing in the search box never swaps the list for a spinner.
 */
export function useUsers(params: ListUsersParams) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => listUsers(params),
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
