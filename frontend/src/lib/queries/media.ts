import type { ListMediaParams } from '@embrace/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateMediaInput } from '@/types/domain';
import { createMedia, listMedia } from '@/lib/api/media';
import { queryKeys } from './keys';

/** One page of the media library; the previous page stays visible while the next loads. */
export function useMedia(params: ListMediaParams) {
  return useQuery({
    queryKey: queryKeys.media.list(params),
    // TanStack aborts the signal when the key changes, so a superseded page is cancelled.
    queryFn: ({ signal }) => listMedia(params, signal),
    placeholderData: keepPreviousData,
  });
}

/** Staff only. Refetches every media page after a create. */
export function useCreateMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMediaInput) => createMedia(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.media.all }),
  });
}
