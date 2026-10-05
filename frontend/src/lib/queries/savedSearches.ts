import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as savedSearchesApi from '@/lib/api/savedSearches';
import { queryKeys } from './keys';

export function useSavedSearches() {
  return useQuery({
    queryKey: queryKeys.savedSearches.all,
    queryFn: savedSearchesApi.listSavedSearches,
  });
}

function useSavedSearchMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    // Only the variables reach the API function (not the mutation context).
    mutationFn: (variables: TVariables) => mutationFn(variables),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.savedSearches.all }),
  });
}

export function useCreateSavedSearch() {
  return useSavedSearchMutation(savedSearchesApi.createSavedSearch);
}

export function useDeleteSavedSearch() {
  return useSavedSearchMutation(savedSearchesApi.deleteSavedSearch);
}

/** Records that a saved search was applied (POST /use), refreshing its use count. */
export function useRecordSavedSearchUse() {
  return useSavedSearchMutation(savedSearchesApi.useSavedSearch);
}
