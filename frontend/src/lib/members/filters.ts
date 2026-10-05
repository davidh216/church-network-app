import type { ListUsersParams, SortOrder, UserSortField } from '@embrace/shared';
import { stageLabel } from './display';

/** The member list's quick filters as the inputs hold them; '' and 'all' mean unset. */
export interface MemberFilters {
  search: string;
  role: string;
  stage: string;
  risk: string;
  status: string;
  /** Engagement band: 'high' (80+), 'medium' (50 to 79), 'low' (under 50) or 'all'. */
  engagement: string;
  /** `YYYY-MM-DD` from a date input, inclusive. */
  joinedFrom: string;
  /** `YYYY-MM-DD`, inclusive to the end of that day (the API treats date-only bounds so). */
  joinedTo: string;
}

export const EMPTY_FILTERS: MemberFilters = {
  search: '',
  role: 'all',
  stage: 'all',
  risk: 'all',
  status: 'all',
  engagement: 'all',
  joinedFrom: '',
  joinedTo: '',
};

export interface MemberSort {
  key: UserSortField;
  order: SortOrder;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** A message when the joined-date range cannot be applied, else null. */
export function dateRangeError(from: string, to: string): string | null {
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return 'Enter dates as YYYY-MM-DD.';
  if (from && to && from > to) return 'The start date is after the end date.';
  return null;
}

const unlessAll = (value: string) => (value && value !== 'all' ? value : undefined);

/**
 * GET /api/users parameters for the current filters, sort and page. Members (non-staff)
 * may only search by name and sort by name, so every other filter is dropped for them.
 * A date range that `dateRangeError` rejects is left out rather than sent.
 */
export function buildListParams(
  filters: MemberFilters,
  sort: MemberSort | null,
  page: number,
  pageSize: number,
  staff: boolean,
): ListUsersParams {
  const q = filters.search.trim() || undefined;
  const sortParams =
    sort && (staff || sort.key === 'name') ? { sort: sort.key, order: sort.order } : {};
  if (!staff) return { q, ...sortParams, page, pageSize };
  const datesValid = dateRangeError(filters.joinedFrom, filters.joinedTo) === null;
  const status =
    filters.status === 'active' || filters.status === 'inactive' ? filters.status : undefined;
  return {
    q,
    role: unlessAll(filters.role),
    status,
    stage: unlessAll(filters.stage) as ListUsersParams['stage'],
    risk: unlessAll(filters.risk) as ListUsersParams['risk'],
    joinedFrom: datesValid ? filters.joinedFrom || undefined : undefined,
    joinedTo: datesValid ? filters.joinedTo || undefined : undefined,
    ...sortParams,
    page,
    pageSize,
  };
}

/** The engagement bands of the quick filter, with their labels. */
export const ENGAGEMENT_BANDS: [string, string][] = [
  ['high', 'High (80+)'],
  ['medium', 'Medium (50-79)'],
  ['low', 'Low (under 50)'],
];

const isSet = (value: string) => value.trim() !== '' && value !== 'all';

interface ChipRule {
  /** The filters one chip shows and clears together. */
  keys: (keyof MemberFilters)[];
  label: (filters: MemberFilters) => string;
}

/** One row per active-filter chip, in display order; every quick filter has one. */
const CHIP_RULES: ChipRule[] = [
  { keys: ['search'], label: (f) => `Search: ${f.search.trim()}` },
  { keys: ['role'], label: (f) => `Role: ${stageLabel(f.role)}` },
  { keys: ['stage'], label: (f) => `Stage: ${stageLabel(f.stage)}` },
  { keys: ['risk'], label: (f) => `Risk: ${stageLabel(f.risk)}` },
  { keys: ['status'], label: (f) => `Status: ${stageLabel(f.status)}` },
  {
    keys: ['engagement'],
    label: (f) =>
      `Engagement: ${ENGAGEMENT_BANDS.find(([band]) => band === f.engagement)?.[1] ?? f.engagement}`,
  },
  {
    keys: ['joinedFrom', 'joinedTo'],
    label: ({ joinedFrom: from, joinedTo: to }) =>
      from && to ? `Joined: ${from} to ${to}` : from ? `Joined from ${from}` : `Joined until ${to}`,
  },
];

export interface FilterChip {
  label: string;
  /** The filters this chip clears (set back to their empty values). */
  keys: (keyof MemberFilters)[];
}

/** The chips for the quick filters that are set. */
export function activeFilterChips(filters: MemberFilters): FilterChip[] {
  return CHIP_RULES.filter(({ keys }) => keys.some((key) => isSet(filters[key]))).map(
    ({ keys, label }) => ({ keys, label: label(filters) }),
  );
}

/** `filters` with the chip's keys back at their empty values. */
export function clearChip(filters: MemberFilters, chip: FilterChip): MemberFilters {
  const next = { ...filters };
  for (const key of chip.keys) next[key] = EMPTY_FILTERS[key];
  return next;
}

/** True when any quick filter differs from its empty value. */
export function hasActiveFilters(filters: MemberFilters): boolean {
  return (Object.keys(EMPTY_FILTERS) as (keyof MemberFilters)[]).some(
    (key) => filters[key].trim() !== EMPTY_FILTERS[key],
  );
}

/** Clicking a sortable header cycles ascending, descending, then unsorted. */
export function nextSort(current: MemberSort | null, key: UserSortField): MemberSort | null {
  if (current?.key !== key) return { key, order: 'asc' };
  return current.order === 'asc' ? { key, order: 'desc' } : null;
}

/** Select-all works on the current page: select every row on it, or clear them if all are. */
export function toggleAllOnPage(selected: ReadonlySet<string>, pageIds: string[]): Set<string> {
  const next = new Set(selected);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => next.has(id));
  for (const id of pageIds) {
    if (allSelected) next.delete(id);
    else next.add(id);
  }
  return next;
}

/**
 * "N selected", or "N selected across pages" when some selected members are not on the
 * current page (selection survives paging, so the count says where the rows are).
 */
export function selectionLabel(selected: ReadonlySet<string>, pageIds: string[]): string {
  const onPage = new Set(pageIds);
  const offPage = [...selected].some((id) => !onPage.has(id));
  return `${selected.size} selected${offPage ? ' across pages' : ''}`;
}
