export type SearchPanel = 'advanced' | 'saved' | null;

interface MemberListActionsProps {
  panel: SearchPanel;
  onTogglePanel: (panel: Exclude<SearchPanel, null>) => void;
  selectedCount: number;
  onExport: () => void;
}

const buttonClass = 'px-4 py-2 text-sm font-medium rounded-md transition-colors';
const idle = 'bg-gray-100 text-gray-700 hover:bg-gray-200';
const open = 'bg-blue-600 text-white';

/** Staff buttons beside the member search: advanced search, saved searches and export. */
export default function MemberListActions({
  panel,
  onTogglePanel,
  selectedCount,
  onExport,
}: MemberListActionsProps) {
  return (
    <>
      <button
        type="button"
        aria-expanded={panel === 'advanced'}
        onClick={() => onTogglePanel('advanced')}
        className={`${buttonClass} ${panel === 'advanced' ? open : idle}`}
      >
        Advanced Search
      </button>
      <button
        type="button"
        aria-expanded={panel === 'saved'}
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
