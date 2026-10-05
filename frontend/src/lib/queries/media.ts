import type { ListMediaParams } from '@embrace/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateMediaInput } from '../../types/domain';
import { createMedia, listMedia } from '../api/media';
import { queryKeys } from './keys';

/** One page of the media library; the previous page stays visible while the next loads. */
export function useMedia(params: ListMediaParams) {
  return useQuery({
    queryKey: queryKeys.media.list(params),
    queryFn: () => listMedia(params),
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
