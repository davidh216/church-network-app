import type { UserSortField } from '@embrace/shared';
import type { MemberSort } from '../../lib/members/filters';

interface SortableHeaderProps {
  label: string;
  field: UserSortField;
  sort: MemberSort | null;
  onSort: (field: UserSortField) => void;
  /** False renders a plain header (members may only sort by name). */
  sortable?: boolean;
}

const thClass = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';

/** A member table column header whose button sorts on the server; the header carries aria-sort. */
export default function SortableHeader({
  label,
  field,
  sort,
  onSort,
  sortable = true,
}: SortableHeaderProps) {
  if (!sortable) {
    return (
      <th scope="col" className={thClass}>
        {label}
      </th>
    );
  }
  const active = sort?.key === field ? sort.order : null;
  // aria-sort belongs on the column header; the button inside it is what the keyboard reaches.
  return (
    <th
      scope="col"
      aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
      className={thClass}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className="-mx-1 flex items-center space-x-1 rounded px-1 uppercase tracking-wider hover:bg-gray-100 hover:text-gray-700"
      >
        <span>{label}</span>
        {active && (
          <span aria-hidden="true" className="text-blue-700">
            {active === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </button>
    </th>
  );
}
