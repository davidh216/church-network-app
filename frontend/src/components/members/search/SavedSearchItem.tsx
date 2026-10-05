import { formatLocalDate } from '@/lib/format/date';
import type { SavedSearch } from '@/types/domain';

interface SavedSearchItemProps {
  search: SavedSearch;
  onApply: () => void;
  onDelete: () => void;
}

/** One saved search: apply it (unless its stored query is invalid) or delete it. */
export default function SavedSearchItem({ search, onApply, onDelete }: SavedSearchItemProps) {
  return (
    <li className="flex items-center justify-between gap-2 p-3 border border-gray-200 rounded-lg">
      <button
        type="button"
        className="flex-1 text-left disabled:cursor-not-allowed"
        onClick={onApply}
        disabled={search.invalid}
        aria-label={
          search.invalid ? `${search.name} (invalid, cannot be applied)` : `Apply ${search.name}`
        }
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{search.name}</span>
          {search.isPublic && (
            <span className="px-2 py-0.5 rounded-sm text-xs font-medium bg-green-100 text-green-800">
              Public
            </span>
          )}
          {search.invalid && (
            <span className="px-2 py-0.5 rounded-sm text-xs font-medium bg-red-100 text-red-800">
              Invalid
            </span>
          )}
        </span>
        {search.description && (
          <span className="block text-xs text-gray-600 mt-1">{search.description}</span>
        )}
        <span className="block text-xs text-gray-600 mt-1">
          {search.invalid
            ? 'This search no longer matches the search rules and cannot be applied.'
            : `Saved ${formatLocalDate(search.createdAt) ?? ''}`.trim()}
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-red-600 hover:text-red-800 p-1"
        aria-label={`Delete saved search ${search.name}`}
        title="Delete search"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </li>
  );
}
