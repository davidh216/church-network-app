import type { ApiEnvelope, CreateMediaInput, MediaItem } from '../../types/domain';
import { apiFetch } from './client';

export interface MediaFilters {
  search?: string;
  tag?: string;
}

export async function listMedia(filters: MediaFilters = {}): Promise<MediaItem[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.tag && filters.tag !== 'all') params.set('tag', filters.tag);
  const query = params.toString();
  const data = await apiFetch<ApiEnvelope<{ media: MediaItem[] }>>(`/media${query ? `?${query}` : ''}`);
  return data.media;
}

/** Staff only. */
export async function createMedia(input: CreateMediaInput): Promise<MediaItem> {
  const data = await apiFetch<ApiEnvelope<{ media: MediaItem }>>('/media', { method: 'POST', json: input });
  return data.media;
}
