import { useQuery } from '@tanstack/react-query';
import { listRoles } from '../api/roles';
import { queryKeys } from './keys';

/** Roles change rarely; they stay fresh for the session. `enabled: false` defers the fetch. */
export function useRoles({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.roles.all,
    queryFn: listRoles,
    staleTime: Infinity,
    enabled,
  });
}
