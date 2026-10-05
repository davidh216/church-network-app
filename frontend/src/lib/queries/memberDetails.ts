import type { ListTimelineParams } from '@embrace/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getMemberDetails, getMemberTimeline } from '@/lib/api/memberDetails';
import { queryKeys } from './keys';

/** Staff only: the full CRM profile shown on `/members/[id]`. */
export function useMemberDetails(id: string) {
  return useQuery({
    queryKey: queryKeys.memberDetails.detail(id),
    queryFn: () => getMemberDetails(id),
  });
}

/** Staff only: one page of the member's timeline; the previous page stays visible while the next loads. */
export function useMemberTimeline(id: string, params: ListTimelineParams) {
  return useQuery({
    queryKey: queryKeys.memberDetails.timeline(id, params),
    queryFn: ({ signal }) => getMemberTimeline(id, params, signal),
    placeholderData: keepPreviousData,
  });
}
