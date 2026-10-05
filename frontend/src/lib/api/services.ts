import type { ListServicesParams, Service } from '@embrace/shared';
import type { ApiEnvelope } from '@/types/domain';
import { apiFetch } from './client';
import { queryString, type Paged } from './query';

export interface ServicePage extends Paged {
  services: Service[];
}

/**
 * GET /api/services (staff): one page of services, newest first, optionally within an inclusive
 * `from`/`to` date range (`YYYY-MM-DD`) and of one type.
 */
export async function listServices(
  params: ListServicesParams = {},
  signal?: AbortSignal,
): Promise<ServicePage> {
  const { services, total, page, pageSize } = await apiFetch<ApiEnvelope<ServicePage>>(
    `/services${queryString(params)}`,
    { signal },
  );
  return { services, total, page, pageSize };
}
