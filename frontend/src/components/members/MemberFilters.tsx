import type { ReactNode } from 'react';
import { formatStage } from '../../lib/members/display';
import type { MemberFilters as Filters, MemberSort } from '../../lib/members/filters';

interface MemberFiltersProps {
  filters: Filters;
  onFilterChange: (key: keyof Filters, value: string) => void;
  onClearAll: () => void;
  sort: MemberSort | null;
  onClearSort: () => void;
  /** Members may search by name only, so the quick filters are staff-only. */
  canManage: boolean;
  /** An invalid joined-date range; shown as an alert, the range is not sent. */
  dateError: string | null;
  /** Buttons shown beside the search box (export, advanced search). */
  actions?: ReactNode;
}

const filterClass =
  'px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

const SELECTS: { key: keyof Filters; label: string; options: [string, string][] }[] = [
  {
    key: 'role',
    label: 'Role',
    options: [
      ['all', 'All Roles'],
      ['admin', 'Admin'],
      ['leader', 'Leader'],
      ['member', 'Member'],
    ],
  },
  {
    key: 'stage',
    label: 'Membership stage',
    options: [
      ['all', 'All Stages'],
      ['leader', 'Leader'],
      ['core_member', 'Core Member'],
      ['active_member', 'Active Member'],
      ['new_member', 'New Member'],
      ['visitor', 'Visitor'],
      ['at_risk', 'At Risk'],
      ['inactive', 'Inactive'],
    ],
  },
  {
    key: 'risk',
    label: 'Risk level',
    options: [
      ['all', 'All Risk Levels'],
      ['low', 'Low Risk'],
      ['medium', 'Medium Risk'],
      ['high', 'High Risk'],
    ],
  },
  {
    key: 'status',
    label: 'Status',
    options: [
      ['all', 'All Status'],
      ['active', 'Active'],
      ['inactive', 'Inactive'],
    ],
  },
];

/** The member search box, the staff quick filters and the active-filter chips. */
export default function MemberFilters({
  filters,
  onFilterChange,
  onClearAll,
  sort,
  onClearSort,
  canManage,
  dateError,
  actions,
}: MemberFiltersProps) {
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.search)
    chips.push({ label: `Search: ${filters.search}`, clear: () => onFilterChange('search', '') });
  if (filters.role !== 'all')
    chips.push({ label: `Role: ${filters.role}`, clear: () => onFilterChange('role', 'all') });
  if (filters.stage !== 'all') {
    chips.push({
      label: `Stage: ${formatStage(filters.stage)}`,
      clear: () => onFilterChange('stage', 'all'),
    });
  }
  if (sort) chips.push({ label: `Sorted by: ${sort.key} ${sort.order}`, clear: onClearSort });

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name, email, phone, or bio..."
              aria-label="Search members"
              value={filters.search}
              onChange={(e) => onFilterChange('search', e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg
              className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {SELECTS.map(({ key, label, options }) => (
            <select
              key={key}
              aria-label={label}
              value={filters[key]}
              onChange={(e) => onFilterChange(key, e.target.value)}
              className={filterClass}
            >
              {options.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          ))}
          <input
            type="date"
            aria-label="Joined from"
            value={filters.joinedFrom}
            onChange={(e) => onFilterChange('joinedFrom', e.target.value)}
            className={filterClass}
          />
          <input
            type="date"
            aria-label="Joined to (inclusive)"
            value={filters.joinedTo}
            onChange={(e) => onFilterChange('joinedTo', e.target.value)}
            className={filterClass}
          />
          <button
            type="button"
            onClick={onClearAll}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            Clear All
          </button>
        </div>
      )}
      {dateError && (
        <p role="alert" className="text-sm text-red-700">
          {dateError} The date range is not applied.
        </p>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-500">Active filters:</span>
          {chips.map((chip) => (
            <FilterChip key={chip.label} label={chip.label} onClear={chip.clear} />
          ))}
        </div>
      )}
    </div>
  );
}

/** An active filter with a button that clears it. */
function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label}`}
        className="ml-1 text-blue-600 hover:text-blue-800"
      >
        ×
      </button>
    </span>
  );
}
