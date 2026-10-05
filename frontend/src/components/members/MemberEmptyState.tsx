interface MemberEmptyStateProps {
  /** True when filters are narrowing the list, so a clear action is offered. */
  filtersActive: boolean;
  onClearFilters: () => void;
}

/** "No members found", with a "Clear all filters" button when filters are active. */
export default function MemberEmptyState({ filtersActive, onClearFilters }: MemberEmptyStateProps) {
  return (
    <div className="px-6 py-12 text-center">
      <svg
        aria-hidden="true"
        className="mx-auto h-12 w-12 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
      <h2 className="mt-2 text-sm font-medium text-gray-900">No members found</h2>
      <p className="mt-1 text-sm text-gray-500">
        {filtersActive
          ? 'No members match your current search criteria. Try adjusting your filters.'
          : 'Get started by adding your first member to the church community.'}
      </p>
      {filtersActive && (
        <div className="mt-6">
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-xs text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
