import type { ListMediaParams } from '@embrace/shared';
import type { ApiEnvelope, CreateMediaInput, MediaItem } from '@/types/domain';
import { apiFetch } from './client';
import { queryString, type Paged } from './query';

export interface MediaPage extends Paged {
  media: MediaItem[];
}

/** GET /api/media: one page (24 by default) of the library; tag "all" means no tag filter. */
export async function listMedia(params: ListMediaParams = {}): Promise<MediaPage> {
  const { tag, ...rest } = params;
  const { media, total, page, pageSize } = await apiFetch<ApiEnvelope<MediaPage>>(
    `/media${queryString({ ...rest, tag: tag === 'all' ? undefined : tag })}`,
  );
  return { media, total, page, pageSize };
}

/** Staff only. */
export async function createMedia(input: CreateMediaInput): Promise<MediaItem> {
  const data = await apiFetch<ApiEnvelope<{ media: MediaItem }>>('/media', {
    method: 'POST',
    json: input,
  });
  return data.media;
}
