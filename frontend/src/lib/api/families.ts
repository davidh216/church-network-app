import type {
  CreateFamilyInput,
  FamilyDetail,
  FamilyList,
  FamilyMembershipResult,
  FamilyRelationshipEntry,
  ListFamiliesParams,
  OwnFamily,
  SetFamilyRelationshipInput,
  UpdateFamilyInput,
} from '@embrace/shared';
import type { ApiEnvelope } from '@/types/domain';
import { apiFetch } from './client';
import { queryString } from './query';

/** GET /api/families (staff): one page of families by name, with member counts and the head. */
export async function listFamilies(
  params: ListFamiliesParams = {},
  signal?: AbortSignal,
): Promise<FamilyList> {
  const { families, total, page, pageSize } = await apiFetch<ApiEnvelope<FamilyList>>(
    `/families${queryString(params)}`,
    { signal },
  );
  return { families, total, page, pageSize };
}

/** GET /api/families/mine (any signed-in user): names and relationships only, or null. */
export async function getOwnFamily(signal?: AbortSignal): Promise<OwnFamily | null> {
  const data = await apiFetch<ApiEnvelope<{ family: OwnFamily | null }>>('/families/mine', {
    signal,
  });
  return data.family;
}

const familyPath = (id: string) => `/families/${encodeURIComponent(id)}`;

/** GET /api/families/:id (staff): address, members and relationships. */
export async function getFamily(id: string, signal?: AbortSignal): Promise<FamilyDetail> {
  const data = await apiFetch<ApiEnvelope<{ family: FamilyDetail }>>(familyPath(id), { signal });
  return data.family;
}

/** POST /api/families (staff). */
export async function createFamily(input: CreateFamilyInput): Promise<FamilyDetail> {
  const data = await apiFetch<ApiEnvelope<{ family: FamilyDetail }>>('/families', {
    method: 'POST',
    json: input,
  });
  return data.family;
}

/** PATCH /api/families/:id (staff): name, address, head (a member, or null to clear). */
export async function updateFamily(id: string, input: UpdateFamilyInput): Promise<FamilyDetail> {
  const data = await apiFetch<ApiEnvelope<{ family: FamilyDetail }>>(familyPath(id), {
    method: 'PATCH',
    json: input,
  });
  return data.family;
}

/** DELETE /api/families/:id (admin): unlinks the members and deletes the relationships. */
export async function deleteFamily(
  id: string,
): Promise<{ members: number; relationships: number }> {
  const { members, relationships } = await apiFetch<
    ApiEnvelope<{ members: number; relationships: number }>
  >(familyPath(id), { method: 'DELETE' });
  return { members, relationships };
}

const memberPath = (familyId: string, userId: string) =>
  `${familyPath(familyId)}/members/${encodeURIComponent(userId)}`;

/**
 * PUT /api/families/:id/members/:userId (staff). Someone in another family rejects with a 409
 * (code IN_OTHER_FAMILY) unless `move` is true.
 */
export async function putFamilyMember(
  familyId: string,
  userId: string,
  move = false,
): Promise<FamilyMembershipResult> {
  const { member, movedFrom } = await apiFetch<ApiEnvelope<FamilyMembershipResult>>(
    memberPath(familyId, userId),
    { method: 'PUT', json: move ? { move: true } : {} },
  );
  return { member, movedFrom };
}

/** DELETE /api/families/:id/members/:userId (staff): also deletes their relationships there. */
export async function removeFamilyMember(familyId: string, userId: string): Promise<void> {
  await apiFetch<ApiEnvelope<object>>(memberPath(familyId, userId), { method: 'DELETE' });
}

/** PUT /api/families/:id/relationships (staff): `userId` is the `type` of `relatedUserId`. */
export async function setFamilyRelationship(
  familyId: string,
  input: SetFamilyRelationshipInput,
): Promise<FamilyRelationshipEntry> {
  const data = await apiFetch<ApiEnvelope<{ relationship: FamilyRelationshipEntry }>>(
    `${familyPath(familyId)}/relationships`,
    { method: 'PUT', json: input },
  );
  return data.relationship;
}

/** DELETE /api/families/:id/relationships/:relationshipId (staff). */
export async function removeFamilyRelationship(
  familyId: string,
  relationshipId: string,
): Promise<void> {
  await apiFetch<ApiEnvelope<object>>(
    `${familyPath(familyId)}/relationships/${encodeURIComponent(relationshipId)}`,
    { method: 'DELETE' },
  );
}
