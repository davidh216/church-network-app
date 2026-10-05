import type { ApiEnvelope, MemberDetails } from '@/types/domain';
import { apiFetch } from './client';

/** Staff only: the full CRM profile of a member. */
export async function getMemberDetails(id: string): Promise<MemberDetails> {
  const data = await apiFetch<ApiEnvelope<{ user: MemberDetails }>>(
    `/member-details/${encodeURIComponent(id)}`,
  );
  return data.user;
}
