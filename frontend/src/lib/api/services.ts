import type {
  CreateServiceInput,
  ListServicesParams,
  MarkAttendanceInput,
  Service,
  ServiceAttendance,
  UpdateServiceInput,
} from '@embrace/shared';
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

const servicePath = (id: string) => `/services/${encodeURIComponent(id)}`;

/** POST /api/services (staff). A second service of the same type on the same date is a 409. */
export async function createService(input: CreateServiceInput): Promise<Service> {
  const data = await apiFetch<ApiEnvelope<{ service: Service }>>('/services', {
    method: 'POST',
    json: input,
  });
  return data.service;
}

/** PUT /api/services/:id (staff): any subset of the fields; a blank title or notes clears it. */
export async function updateService(id: string, input: UpdateServiceInput): Promise<Service> {
  const data = await apiFetch<ApiEnvelope<{ service: Service }>>(servicePath(id), {
    method: 'PUT',
    json: input,
  });
  return data.service;
}

/** DELETE /api/services/:id (admin only): also deletes the service's attendance records. */
export async function deleteService(id: string): Promise<void> {
  await apiFetch<ApiEnvelope<object>>(servicePath(id), { method: 'DELETE' });
}

/**
 * GET /api/services/:id/attendance (staff): the service and one row per active member (plus
 * anyone already recorded), with whether they were recorded present.
 */
export async function getServiceAttendance(
  id: string,
  signal?: AbortSignal,
): Promise<ServiceAttendance> {
  const { service, members } = await apiFetch<ApiEnvelope<ServiceAttendance>>(
    `${servicePath(id)}/attendance`,
    { signal },
  );
  return { service, members };
}

export interface AttendanceSaved {
  /** How many members the service now has recorded present and absent (after the save). */
  present: number;
  absent: number;
}

/**
 * PUT /api/services/:id/attendance (staff): marks the listed members present or absent in one
 * idempotent upsert; members in neither list keep what was recorded before.
 */
export async function saveServiceAttendance(
  id: string,
  input: MarkAttendanceInput,
): Promise<AttendanceSaved> {
  const { present, absent } = await apiFetch<ApiEnvelope<AttendanceSaved>>(
    `${servicePath(id)}/attendance`,
    { method: 'PUT', json: input },
  );
  return { present, absent };
}
