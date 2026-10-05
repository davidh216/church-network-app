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

/** A member table column header that sorts on the server when clicked. */
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
  return (
    <th
      scope="col"
      aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
      className={`${thClass} cursor-pointer hover:bg-gray-100`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{label}</span>
        {active && <span className="text-blue-500">{active === 'asc' ? '↑' : '↓'}</span>}
      </div>
    </th>
  );
}
