'use client';

import { useState } from 'react';
import { useIsStaff } from '../../lib/auth/AuthProvider';
import { getErrorMessage } from '../../lib/errors';
import {
  useCreateSavedSearch,
  useDeleteSavedSearch,
  useRecordSavedSearchUse,
  useSavedSearches,
} from '../../lib/queries/savedSearches';
import InlineError from '../ui/InlineError';
import { predefinedSearches } from '../../lib/members/predefinedSearches';
import type { SavedSearch, SearchQuery } from '../../types/domain';

// The quick searches need the advanced-query evaluator; hidden until it exists (gameplan 2.4 / F038).
const PREDEFINED_SEARCHES_ENABLED = false;

interface SavedSearchesProps {
  onLoadSearch: (query: SearchQuery) => void;
  onClose: () => void;
  currentQuery: SearchQuery | null;
}

export default function SavedSearches({ onLoadSearch, onClose, currentQuery }: SavedSearchesProps) {
  const canManage = useIsStaff();
  const searchesQuery = useSavedSearches();
  const savedSearches = searchesQuery.data ?? [];
  const loading = searchesQuery.isPending;
  const createSearch = useCreateSavedSearch();
  const deleteSearch = useDeleteSavedSearch();
  const recordUse = useRecordSavedSearchUse();
  const [error, setError] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveForm, setSaveForm] = useState({
    name: '',
    description: '',
    isPublic: false,
  });

  const handleSaveCurrentSearch = async () => {
    if (!currentQuery || !saveForm.name.trim()) return;

    try {
      await createSearch.mutateAsync({
        name: saveForm.name,
        description: saveForm.description,
        query: currentQuery,
        isPublic: saveForm.isPublic,
      });
      setShowSaveForm(false);
      setSaveForm({ name: '', description: '', isPublic: false });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save search'));
    }
  };

  const handleDeleteSearch = async (searchId: string) => {
    if (!confirm('Are you sure you want to delete this saved search?')) return;

    try {
      await deleteSearch.mutateAsync(searchId);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete search'));
    }
  };

  const handleLoadSavedSearch = (search: SavedSearch) => {
    onLoadSearch(search.query);
    // Usage tracking is best effort; a failure must not block loading the search.
    recordUse.mutate(search.id);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Saved Searches</h3>
        <div className="flex items-center space-x-2">
          {canManage && currentQuery && (
            <button
              onClick={() => setShowSaveForm(!showSaveForm)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Save Current Search
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm"
        >
          {error}
        </div>
      )}
      {searchesQuery.error && (
        <InlineError
          error={searchesQuery.error}
          fallback="Failed to load saved searches"
          onRetry={() => void searchesQuery.refetch()}
          className="mb-4"
        />
      )}

      {canManage && showSaveForm && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Save Current Search</h4>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Search name..."
              value={saveForm.name}
              onChange={(e) => setSaveForm({ ...saveForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              placeholder="Description (optional)..."
              value={saveForm.description}
              onChange={(e) => setSaveForm({ ...saveForm, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={saveForm.isPublic}
                onChange={(e) => setSaveForm({ ...saveForm, isPublic: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Share with other users</span>
            </label>
            <div className="flex space-x-2">
              <button
                onClick={handleSaveCurrentSearch}
                disabled={!saveForm.name.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Save
              </button>
              <button
                onClick={() => setShowSaveForm(false)}
                className="px-3 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Predefined Searches */}
      {PREDEFINED_SEARCHES_ENABLED && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Quick Searches</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {predefinedSearches().map((search, index) => (
              <div
                key={index}
                className="p-3 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer transition-colors"
                onClick={() => onLoadSearch(search.query)}
              >
                <h5 className="text-sm font-medium text-gray-900">{search.name}</h5>
                <p className="text-xs text-gray-500 mt-1">{search.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User's Saved Searches */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 mb-3">Your Saved Searches</h4>
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : savedSearches.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">
            No saved searches yet. Create complex searches and save them for quick access.
          </p>
        ) : (
          <div className="space-y-2">
            {savedSearches.map((search) => (
              <div
                key={search.id}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-300"
              >
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => handleLoadSavedSearch(search)}
                >
                  <div className="flex items-center space-x-2">
                    <h5 className="text-sm font-medium text-gray-900">{search.name}</h5>
                    {search.isPublic && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        Public
                      </span>
                    )}
                  </div>
                  {search.description && (
                    <p className="text-xs text-gray-500 mt-1">{search.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Saved {new Date(search.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSearch(search.id);
                  }}
                  className="text-red-600 hover:text-red-800 p-1"
                  title="Delete search"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
