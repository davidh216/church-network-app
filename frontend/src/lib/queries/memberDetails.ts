import { useQuery } from '@tanstack/react-query';
import { getMemberDetails } from '../api/memberDetails';
import { queryKeys } from './keys';

/** Staff only: the full CRM profile shown on `/members/[id]`. */
export function useMemberDetails(id: string) {
  return useQuery({
    queryKey: queryKeys.memberDetails.detail(id),
    queryFn: () => getMemberDetails(id),
  });
}
