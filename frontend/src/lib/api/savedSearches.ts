import type { ApiEnvelope, CreateSavedSearchInput, SavedSearch } from '../../types/domain';
import { apiFetch } from './client';

export async function listSavedSearches(): Promise<SavedSearch[]> {
  const data = await apiFetch<ApiEnvelope<{ searches: SavedSearch[] }>>('/users/saved-searches');
  return data.searches;
}

export async function createSavedSearch(input: CreateSavedSearchInput): Promise<SavedSearch> {
  const data = await apiFetch<ApiEnvelope<{ search: SavedSearch }>>('/users/saved-searches', {
    method: 'POST',
    json: input,
  });
  return data.search;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  await apiFetch<unknown>(`/users/saved-searches/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Records that a saved search was used. Not a React hook despite the name;
 * call it through the module namespace (`savedSearchesApi.useSavedSearch`).
 */
export async function useSavedSearch(id: string): Promise<void> {
  await apiFetch<unknown>(`/users/saved-searches/${encodeURIComponent(id)}/use`, { method: 'POST' });
}
