import type { ListTimelineParams, MemberAttendanceParams } from '@embrace/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  getMemberAttendance,
  getMemberDetails,
  getMemberTimeline,
  getOwnAttendance,
} from '@/lib/api/memberDetails';
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

/** Staff only: a member's attendance summary; the previous window stays visible while the next loads. */
export function useMemberAttendance(id: string, params: MemberAttendanceParams) {
  return useQuery({
    queryKey: queryKeys.memberDetails.attendance(id, params),
    queryFn: ({ signal }) => getMemberAttendance(id, params, signal),
    placeholderData: keepPreviousData,
  });
}

/** The signed-in user's own attendance summary. */
export function useOwnAttendance(params: MemberAttendanceParams = {}) {
  return useQuery({
    queryKey: queryKeys.memberDetails.ownAttendance(params),
    queryFn: ({ signal }) => getOwnAttendance(params, signal),
  });
}
