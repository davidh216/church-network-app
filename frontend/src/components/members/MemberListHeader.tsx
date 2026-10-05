import type { RefObject } from 'react';
import ViewToggle, { GRID_ICON, LIST_ICON, type ViewOption } from '@/components/ui/ViewToggle';

export type ViewMode = 'table' | 'cards';

const VIEWS: ViewOption<ViewMode>[] = [
  { mode: 'table', title: 'Table View', icon: LIST_ICON },
  { mode: 'cards', title: 'Card View', icon: GRID_ICON },
];

interface MemberListHeaderProps {
  /** Members matching across pages; null until the first page has loaded. */
  total: number | null;
  /** "N selected" text, or null when nothing is selected. */
  selection: string | null;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  /** Shown to staff only. */
  onAdd?: () => void;
  /** The page heading; dialogs focus it when their opener is gone. */
  headingRef?: RefObject<HTMLHeadingElement | null>;
}

/** The "Church Members" heading with the total, the view toggle and Add Member. */
export default function MemberListHeader({
  total,
  selection,
  viewMode,
  onViewModeChange,
  onAdd,
  headingRef,
}: MemberListHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center space-x-4">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-medium text-gray-900 focus:outline-hidden"
        >
          Church Members
        </h1>
        <span aria-live="polite" className="text-sm text-gray-500">
          {total !== null && `(${total} total)`}
        </span>
        {selection && (
          <span aria-live="polite" className="text-sm text-blue-700 font-medium">
            {selection}
          </span>
        )}
      </div>
      <div className="flex items-center space-x-3">
        <ViewToggle value={viewMode} onChange={onViewModeChange} options={VIEWS} />
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 flex items-center space-x-2"
          >
            <svg
              aria-hidden="true"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span>Add Member</span>
          </button>
        )}
      </div>
    </div>
  );
}
