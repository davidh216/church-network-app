export const LIST_ICON =
  'M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z';
export const GRID_ICON =
  'M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z';

export interface ViewOption<T extends string> {
  mode: T;
  title: string;
  /** SVG path for the 20x20 icon. */
  icon: string;
}

interface ViewToggleProps<T extends string> {
  value: T;
  onChange: (mode: T) => void;
  options: ViewOption<T>[];
}

/** A segmented icon-button switch between views (table/cards, grid/list). */
export default function ViewToggle<T extends string>({
  value,
  onChange,
  options,
}: ViewToggleProps<T>) {
  return (
    <div role="group" aria-label="View" className="flex bg-gray-100 rounded-md p-1">
      {options.map(({ mode, title, icon }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-label={title}
          aria-pressed={value === mode}
          className={`p-2 rounded transition-colors ${value === mode ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
          title={title}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path d={icon} />
          </svg>
        </button>
      ))}
    </div>
  );
}
