import type { ListServicesParams } from '@embrace/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listServices } from '@/lib/api/services';
import { queryKeys } from './keys';

/** Staff only: one page of services; the previous page stays visible while the next loads. */
export function useServices(params: ListServicesParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.services.list(params),
    queryFn: ({ signal }) => listServices(params, signal),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}
