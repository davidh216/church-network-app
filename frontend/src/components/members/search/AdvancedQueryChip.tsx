import type { SearchQuery } from '@embrace/shared';
import { describeQuery } from '@/lib/members/searchQuery';

interface AdvancedQueryChipProps {
  query: SearchQuery;
  onEdit: () => void;
  onClear: () => void;
}

/** Shown in place of the quick filters while the list shows an advanced search result. */
export default function AdvancedQueryChip({ query, onEdit, onClear }: AdvancedQueryChipProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Advanced query">
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
        Advanced query active
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear advanced query"
          className="ml-1 text-blue-700 hover:text-blue-900"
        >
          ×
        </button>
      </span>
      <button
        type="button"
        onClick={onEdit}
        className="text-sm text-blue-700 underline hover:text-blue-900"
      >
        Edit query
      </button>
      <span className="text-sm text-gray-600 break-words">{describeQuery(query)}</span>
    </div>
  );
}
