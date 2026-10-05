'use client';

interface BulkActionsToolbarProps {
  selectedCount: number;
  onExport: () => void;
  onClearSelection: () => void;
}

// Only actions the API supports are offered. Bulk update, tags, email campaigns,
// groups, labels and reports return when they have a backend (gameplan Phase 2+).
export default function BulkActionsToolbar({
  selectedCount,
  onExport,
  onClearSelection,
}: BulkActionsToolbarProps) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <svg
              aria-hidden="true"
              className="w-5 h-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm font-medium text-blue-900">
              {selectedCount} member{selectedCount !== 1 ? 's' : ''} selected
            </span>
          </div>

          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center px-3 py-1.5 border border-blue-300 shadow-xs text-xs font-medium rounded-sm text-blue-700 bg-white hover:bg-blue-50 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg
              aria-hidden="true"
              className="w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Export CSV
          </button>
        </div>

        <button
          type="button"
          onClick={onClearSelection}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          Clear Selection
        </button>
      </div>
    </div>
  );
}
