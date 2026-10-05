import type { SearchQuery } from '@embrace/shared';
import { useClampedPage } from '@/lib/hooks/useClampedPage';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useResettingPage } from '@/lib/hooks/useResettingPage';
import { useMemberRows, type MemberRowsRequest } from '@/lib/queries/users';
import { buildListParams, type MemberFilters, type MemberSort } from './filters';
import { filtersToQuery, searchNarrowedToName } from './searchQuery';

interface MemberResultsInput {
  /** The quick filters as the inputs hold them; the query follows 300 ms after the last change. */
  filters: MemberFilters;
  sort: MemberSort | null;
  pageSize: number;
  /** An applied advanced query (staff); the list then shows POST /api/users/search results. */
  advancedQuery: SearchQuery | null;
  staff: boolean;
}

/**
 * The member list's data: which endpoint to ask, the page (back to 1 when anything else
 * changes, clamped when the total shrinks), and the query "Save Current Search" would store.
 * GET /api/users has no engagement filter, so with an engagement band set the quick filters
 * go through the search endpoint as conditions.
 */
export function useMemberResults({
  filters,
  sort,
  pageSize,
  advancedQuery,
  staff,
}: MemberResultsInput) {
  // The whole filter object is debounced, so typing a date does not fire a request per key.
  const debounced = useDebouncedValue(filters);
  const [page, setPage] = useResettingPage(
    JSON.stringify([debounced, sort, pageSize, advancedQuery]),
  );
  const sortParams = sort ? { sort: sort.key, order: sort.order } : {};
  const quickSearch = staff && debounced.engagement !== 'all' ? filtersToQuery(debounced) : null;
  const searchBase = advancedQuery ?? quickSearch;
  const request: MemberRowsRequest = searchBase
    ? { kind: 'search', query: { ...searchBase, ...sortParams, page, pageSize } }
    : { kind: 'list', params: buildListParams(debounced, sort, page, pageSize, staff) };
  const query = useMemberRows(request);
  useClampedPage(page, setPage, query.isPlaceholderData ? undefined : query.data?.total, pageSize);

  // What "Save Current Search" stores: the advanced query, or the quick filters as the inputs
  // show them, as conditions.
  const baseQuery = advancedQuery ?? filtersToQuery(filters);
  return {
    query,
    page,
    setPage,
    currentQuery: baseQuery && { ...baseQuery, ...sortParams },
    /** The quick filters' text search is stored (and, with engagement, listed) as a name match. */
    nameOnly: !advancedQuery && searchNarrowedToName(filters),
  };
}
