import type { RefObject } from 'react';

export type SearchPanel = 'advanced' | 'saved' | null;
type OpenPanel = Exclude<SearchPanel, null>;

/** Stable ids of the two search panels, for the toggles' aria-controls. */
export const PANEL_IDS: Record<OpenPanel, string> = {
  advanced: 'advanced-search-panel',
  saved: 'saved-searches-panel',
};

interface MemberListActionsProps {
  panel: SearchPanel;
  /** The toggle buttons; focus returns to the one that opened a panel when it closes. */
  toggleRefs: Record<OpenPanel, RefObject<HTMLButtonElement | null>>;
  onTogglePanel: (panel: OpenPanel) => void;
  selectedCount: number;
  onExport: () => void;
}

const buttonClass = 'px-4 py-2 text-sm font-medium rounded-md transition-colors';
const idle = 'bg-gray-100 text-gray-700 hover:bg-gray-200';
const open = 'bg-blue-600 text-white';

/** Staff buttons beside the member search: advanced search, saved searches and export. */
export default function MemberListActions({
  panel,
  toggleRefs,
  onTogglePanel,
  selectedCount,
  onExport,
}: MemberListActionsProps) {
  return (
    <>
      <button
        type="button"
        ref={toggleRefs.advanced}
        aria-expanded={panel === 'advanced'}
        aria-controls={PANEL_IDS.advanced}
        onClick={() => onTogglePanel('advanced')}
        className={`${buttonClass} ${panel === 'advanced' ? open : idle}`}
      >
        Advanced Search
      </button>
      <button
        type="button"
        ref={toggleRefs.saved}
        aria-expanded={panel === 'saved'}
        aria-controls={PANEL_IDS.saved}
        onClick={() => onTogglePanel('saved')}
        className={`${buttonClass} ${panel === 'saved' ? open : idle}`}
      >
        Saved Searches
      </button>
      {selectedCount > 0 && (
        <button
          type="button"
          onClick={onExport}
          className={`${buttonClass} bg-green-100 text-green-800 hover:bg-green-200`}
        >
          Export Selected ({selectedCount})
        </button>
      )}
    </>
  );
}
