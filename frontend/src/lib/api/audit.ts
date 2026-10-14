import type { AuditEvent, ListAuditParams } from '@embrace/shared';
import type { ApiEnvelope } from '@/types/domain';
import { apiFetch } from './client';
import { queryString, type Paged } from './query';

export interface AuditPage extends Paged {
  events: AuditEvent[];
}

/**
 * GET /api/audit (admin): one page of audit events, newest first, filtered by actor, action,
 * target and an inclusive date range (`YYYY-MM-DD`, UTC days).
 */
export async function listAudit(
  params: ListAuditParams = {},
  signal?: AbortSignal,
): Promise<AuditPage> {
  const { events, total, page, pageSize } = await apiFetch<ApiEnvelope<AuditPage>>(
    `/audit${queryString(params)}`,
    { signal },
  );
  return { events, total, page, pageSize };
}
