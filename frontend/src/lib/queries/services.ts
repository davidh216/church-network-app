import type {
  CreateServiceInput,
  ListServicesParams,
  MarkAttendanceInput,
  UpdateServiceInput,
} from '@embrace/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  createService,
  deleteService,
  getServiceAttendance,
  listServices,
  saveServiceAttendance,
  updateService,
} from '@/lib/api/services';
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

/** Staff only: the attendance sheet of one service (every active member and what was recorded). */
export function useServiceAttendance(id: string) {
  return useQuery({
    queryKey: queryKeys.services.attendance(id),
    queryFn: ({ signal }) => getServiceAttendance(id, signal),
  });
}

/**
 * A change to services or attendance refetches every service list, sheet and the dashboard tile
 * (all under `services`) and the member profiles' attendance summaries and timelines (under
 * `member-details`).
 */
function invalidateServices(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.services.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.memberDetails.all }),
  ]);
}

/** Staff only. A duplicate (date, type) rejects with the API's 409 CONFLICT. */
export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceInput) => createService(input),
    onSuccess: () => invalidateServices(queryClient),
  });
}

/** Staff only. */
export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateServiceInput }) =>
      updateService(id, input),
    onSuccess: () => invalidateServices(queryClient),
  });
}

/** Admin only: deletes the service and its attendance. */
export function useDeleteService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteService(id),
    onSuccess: () => invalidateServices(queryClient),
  });
}

/** Staff only: saves the attendance sheet of one service with the bulk endpoint. */
export function useSaveAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MarkAttendanceInput }) =>
      saveServiceAttendance(id, input),
    onSuccess: () => invalidateServices(queryClient),
  });
}
