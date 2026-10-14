import type {
  CreateFamilyInput,
  ListFamiliesParams,
  SetFamilyRelationshipInput,
  UpdateFamilyInput,
} from '@embrace/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  createFamily,
  deleteFamily,
  getFamily,
  getOwnFamily,
  listFamilies,
  putFamilyMember,
  removeFamilyMember,
  removeFamilyRelationship,
  setFamilyRelationship,
  updateFamily,
} from '@/lib/api/families';
import { queryKeys } from './keys';

/** Staff: one page of families; the previous page stays while the search or page changes. */
export function useFamilies(params: ListFamiliesParams) {
  return useQuery({
    queryKey: queryKeys.families.list(params),
    queryFn: ({ signal }) => listFamilies(params, signal),
    placeholderData: keepPreviousData,
  });
}

/** The signed-in user's own family (names only), or null. */
export function useOwnFamily() {
  return useQuery({
    queryKey: queryKeys.families.mine(),
    queryFn: ({ signal }) => getOwnFamily(signal),
  });
}

/** Staff: one family with its members and relationships. */
export function useFamily(id: string) {
  return useQuery({
    queryKey: queryKeys.families.detail(id),
    queryFn: ({ signal }) => getFamily(id, signal),
  });
}

/**
 * A family change refetches every family query, the staff profiles (family name, relatives), the
 * member lists (family filters) and the audit log (every family write is audited).
 */
function invalidateFamilies(queryClient: QueryClient, deletedId?: string) {
  // A deleted family's cached page is dropped, not refetched: a stale copy must never show it as
  // live (on Back, or from an old link), and a refetch would only flash a 404.
  if (deletedId)
    queryClient.removeQueries({ queryKey: queryKeys.families.detail(deletedId), exact: true });
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.families.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.memberDetails.all }),
    // Member lists show and filter by family membership.
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.audit.all }),
  ]);
}

/** Staff only. */
export function useCreateFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFamilyInput) => createFamily(input),
    onSuccess: () => invalidateFamilies(queryClient),
  });
}

/** Staff only: name, address or head. */
export function useUpdateFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFamilyInput }) =>
      updateFamily(id, input),
    onSuccess: () => invalidateFamilies(queryClient),
  });
}

/** Admin only. */
export function useDeleteFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFamily(id),
    onSuccess: (_, id) => invalidateFamilies(queryClient, id),
  });
}

/** Staff only. Someone in another family rejects with the API's 409 unless `move`. */
export function usePutFamilyMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      familyId,
      userId,
      move,
    }: {
      familyId: string;
      userId: string;
      move?: boolean;
    }) => putFamilyMember(familyId, userId, move),
    onSuccess: () => invalidateFamilies(queryClient),
  });
}

/** Staff only. */
export function useRemoveFamilyMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ familyId, userId }: { familyId: string; userId: string }) =>
      removeFamilyMember(familyId, userId),
    onSuccess: () => invalidateFamilies(queryClient),
  });
}

/** Staff only: upserts the pair. */
export function useSetFamilyRelationship() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ familyId, input }: { familyId: string; input: SetFamilyRelationshipInput }) =>
      setFamilyRelationship(familyId, input),
    onSuccess: () => invalidateFamilies(queryClient),
  });
}

/** Staff only. */
export function useRemoveFamilyRelationship() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ familyId, relationshipId }: { familyId: string; relationshipId: string }) =>
      removeFamilyRelationship(familyId, relationshipId),
    onSuccess: () => invalidateFamilies(queryClient),
  });
}
