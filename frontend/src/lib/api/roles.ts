import type { ApiEnvelope, Role } from '../../types/domain';
import { apiFetch } from './client';

export async function listRoles(): Promise<Role[]> {
  const data = await apiFetch<ApiEnvelope<{ roles: Role[] }>>('/roles');
  return data.roles;
}
