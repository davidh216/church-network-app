'use client';

import { useState } from 'react';
import { searchQuery, type SearchQuery } from '@embrace/shared';
import { getErrorMessage } from '@/lib/errors';
import { predefinedSearches } from '@/lib/members/predefinedSearches';
import { describeQuery, NAME_ONLY_SAVE_NOTE } from '@/lib/members/searchQuery';
import {
  useCreateSavedSearch,
  useDeleteSavedSearch,
  useRecordSavedSearchUse,
  useSavedSearches,
} from '@/lib/queries/savedSearches';
import type { SavedSearch } from '@/types/domain';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';
import SaveSearchForm, { type SaveSearchValues } from './search/SaveSearchForm';
import SavedSearchItem from './search/SavedSearchItem';
import { PANEL_IDS } from './MemberListActions';

interface SavedSearchesProps {
  /** Applies a query to the member list (a saved, predefined or edited one). */
  onLoadSearch: (query: SearchQuery) => void;
  onClose: () => void;
  /** The list's current query (advanced, or the quick filters as conditions); null if none. */
  currentQuery: SearchQuery | null;
  /** The current query came from quick filters whose text search is stored as a name match. */
  nameOnly?: boolean;
}

/** The API marks stale rows `invalid`; anything that does not parse is treated the same way. */
function checked(search: SavedSearch): SavedSearch {
  if (search.invalid || searchQuery.safeParse(search.query).success) return search;
  return { ...search, invalid: true };
}

/** Staff only: quick searches, the saved searches (apply, delete) and saving the current query. */
export default function SavedSearches({
  onLoadSearch,
  onClose,
  currentQuery,
  nameOnly = false,
}: SavedSearchesProps) {
  const searchesQuery = useSavedSearches();
  const savedSearches = (searchesQuery.data ?? []).map(checked);
  const createSearch = useCreateSavedSearch();
  const deleteSearch = useDeleteSavedSearch();
  const recordUse = useRecordSavedSearchUse();
  const [error, setError] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);

  const save = async ({ name, description, isPublic }: SaveSearchValues) => {
    if (!currentQuery) return;
    setError('');
    try {
      await createSearch.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        query: currentQuery,
        isPublic,
      });
      setShowSaveForm(false);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save search'));
    }
  };

  const remove = async (search: SavedSearch) => {
    if (!confirm(`Delete the saved search "${search.name}"?`)) return;
    setError('');
    try {
      await deleteSearch.mutateAsync(search.id);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete search'));
    }
  };

  const apply = (search: SavedSearch) => {
    if (search.invalid) return;
    onLoadSearch(search.query);
    // Usage tracking is best effort; a failure must not block applying the search.
    recordUse.mutate(search.id);
  };

  return (
    <section
      id={PANEL_IDS.saved}
      aria-labelledby="saved-searches-heading"
      className="bg-white border border-gray-200 rounded-lg shadow-lg p-6 m-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 id="saved-searches-heading" className="text-lg font-medium text-gray-900">
          Saved Searches
        </h2>
        <div className="flex items-center gap-2">
          {currentQuery && !showSaveForm && (
            <button
              type="button"
              onClick={() => setShowSaveForm(true)}
              className="text-sm text-blue-700 hover:text-blue-900"
            >
              Save Current Search
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close saved searches"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-sm text-sm"
        >
          {error}
        </div>
      )}

      {showSaveForm && currentQuery && (
        <SaveSearchForm
          summary={describeQuery(currentQuery)}
          note={nameOnly ? NAME_ONLY_SAVE_NOTE : undefined}
          saving={createSearch.isPending}
          onSave={(values) => void save(values)}
          onCancel={() => setShowSaveForm(false)}
        />
      )}

      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Quick Searches</h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {predefinedSearches().map((search) => (
            <li key={search.name}>
              <button
                type="button"
                className="w-full h-full p-3 text-left border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                onClick={() => onLoadSearch(search.query)}
              >
                <span className="block text-sm font-medium text-gray-900">{search.name}</span>
                <span className="block text-xs text-gray-600 mt-1">{search.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Your Saved Searches</h3>
        {searchesQuery.error ? (
          <InlineError
            error={searchesQuery.error}
            fallback="Failed to load saved searches"
            onRetry={() => void searchesQuery.refetch()}
          />
        ) : searchesQuery.isPending ? (
          <Skeleton rows={2} label="Loading saved searches" />
        ) : savedSearches.length === 0 ? (
          <p className="text-sm text-gray-600 py-4">
            No saved searches yet. Build a search or set filters, then save it for quick access.
          </p>
        ) : (
          <ul className="space-y-2">
            {savedSearches.map((search) => (
              <SavedSearchItem
                key={search.id}
                search={search}
                onApply={() => apply(search)}
                onDelete={() => void remove(search)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
