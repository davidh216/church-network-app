import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAnalytics, refreshAllEngagement } from '@/lib/api/analytics';
import { queryKeys } from './keys';

/** Staff only. */
export function useAnalytics() {
  return useQuery({ queryKey: queryKeys.analytics.all, queryFn: getAnalytics });
}

/** Staff only. New scores change analytics, member lists and profiles, so all refetch. */
export function useRefreshAllEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => refreshAllEngagement(),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.memberDetails.all }),
      ]),
  });
}
