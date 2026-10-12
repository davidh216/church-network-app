import type { ListAuditParams } from '@embrace/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listAudit } from '@/lib/api/audit';
import { queryKeys } from './keys';

/** Admin only: one page of the audit log; the previous page stays visible while the next loads. */
export function useAuditLog(params: ListAuditParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: ({ signal }) => listAudit(params, signal),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}
