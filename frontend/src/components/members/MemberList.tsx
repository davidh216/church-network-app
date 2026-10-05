// File: frontend/src/components/members/MemberList.tsx
'use client';

import { useCallback, useState } from 'react';
import { DEFAULT_USER_PAGE_SIZE, type SearchQuery, type UserSortField } from '@embrace/shared';
import { exportUsers } from '../../lib/api/users';
import { useIsStaff } from '../../lib/auth/AuthProvider';
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue';
import { useResettingPage } from '../../lib/hooks/useResettingPage';
import {
  EMPTY_FILTERS,
  buildListParams,
  dateRangeError,
  hasActiveFilters,
  nextSort,
  selectionLabel,
  toggleAllOnPage,
  type MemberFilters as Filters,
  type MemberSort,
} from '../../lib/members/filters';
import { filtersToQuery } from '../../lib/members/searchQuery';
import { useMemberSearch, useUsers } from '../../lib/queries/users';
import AddEditMemberModal from './AddEditMemberModal';
import AdvancedSearchBuilder from './AdvancedSearchBuilder';
import SavedSearches from './SavedSearches';
import BulkActionsToolbar from './BulkActionsToolbar';
import MemberCards from './MemberCards';
import MemberEmptyState from './MemberEmptyState';
import MemberFilters from './MemberFilters';
import MemberPagination from './MemberPagination';
import MemberTable from './MemberTable';
import MemberListHeader, { type ViewMode } from './MemberListHeader';
import MemberListActions, { type SearchPanel } from './MemberListActions';
import ErrorToast from '../ui/ErrorToast';
import InlineError from '../ui/InlineError';
import Skeleton from '../ui/Skeleton';
import { downloadBlob } from '../../lib/download';
import { getErrorMessage } from '../../lib/errors';
import type { Member } from '../../types/domain';

/** The `/members` route body; staff add and edit members in place, profiles are links. */
export default function MemberList() {
  // Selection, export, profiles, editing and every filter but the name search are
  // staff-only; members get the name directory.
  const canManage = useIsStaff();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<MemberSort | null>(null);
  const [pageSize, setPageSize] = useState(DEFAULT_USER_PAGE_SIZE);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  // The member form: closed (null), adding ({ member: null }) or editing a member.
  const [editing, setEditing] = useState<{ member: Member | null } | null>(null);
  // Selection is kept across pages and filter changes; export sends exactly these ids.
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<SearchPanel>(null);
  const [toast, setToast] = useState('');
  // An applied advanced query (staff): the list then shows POST /api/users/search results.
  const [advancedQuery, setAdvancedQuery] = useState<SearchQuery | null>(null);

  // The search box updates at once; the query follows 300 ms after the last keystroke.
  const search = useDebouncedValue(filters.search.trim());
  const queryFilters = { ...filters, search };
  const filterKey = JSON.stringify([queryFilters, sort, pageSize, advancedQuery]);
  const [page, setPage] = useResettingPage(filterKey);
  const sortParams = sort ? { sort: sort.key, order: sort.order } : {};
  const listQuery = useUsers(buildListParams(queryFilters, sort, page, pageSize, canManage), {
    enabled: !advancedQuery,
  });
  const searchResult = useMemberSearch(
    advancedQuery ? { ...advancedQuery, ...sortParams, page, pageSize } : null,
  );
  const usersQuery = advancedQuery ? searchResult : listQuery;
  // What "Save Current Search" stores: the advanced query, or the quick filters as conditions.
  const baseQuery = advancedQuery ?? filtersToQuery(queryFilters);
  const currentQuery = baseQuery && { ...baseQuery, ...sortParams };
  const members = usersQuery.data?.users ?? [];
  const total = usersQuery.data?.total ?? 0;
  const pageIds = members.map((m) => m.id);
  const filtersActive = hasActiveFilters(filters) || advancedQuery !== null;
  const dateError = canManage ? dateRangeError(filters.joinedFrom, filters.joinedTo) : null;

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const clearToast = useCallback(() => setToast(''), []);

  const handleSort = (key: UserSortField) => setSort((prev) => nextSort(prev, key));

  const toggleSelectMember = (memberId: string) =>
    setSelectedMembers((prev) => toggleAllOnPage(prev, [memberId]));

  const toggleSelectAll = () => setSelectedMembers((prev) => toggleAllOnPage(prev, pageIds));

  const clearAllFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAdvancedQuery(null);
    setSort(null);
  };

  const togglePanel = (next: Exclude<SearchPanel, null>) =>
    setPanel((prev) => (prev === next ? null : next));

  // The applied query replaces the quick filters (the builder starts from them).
  const applyQuery = (query: SearchQuery) => {
    const { conditions, logic } = query;
    setAdvancedQuery({ conditions, logic });
    if (query.sort) setSort({ key: query.sort, order: query.order ?? 'asc' });
    setFilters(EMPTY_FILTERS);
    setPanel(null);
  };

  const exportMembers = async () => {
    try {
      const { blob, filename } = await exportUsers(Array.from(selectedMembers));
      downloadBlob(blob, filename);
    } catch (err) {
      setToast(getErrorMessage(err, 'Export failed'));
    }
  };

  const editMember = (member: Member) => setEditing({ member });

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <MemberListHeader
          total={total}
          selection={selectedMembers.size > 0 ? selectionLabel(selectedMembers, pageIds) : null}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onAdd={canManage ? () => setEditing({ member: null }) : undefined}
        />

        <MemberFilters
          filters={filters}
          onFilterChange={setFilter}
          onClearAll={clearAllFilters}
          sort={sort}
          onClearSort={() => setSort(null)}
          canManage={canManage}
          dateError={dateError}
          advanced={
            advancedQuery && {
              query: advancedQuery,
              onEdit: () => setPanel('advanced'),
              onClear: () => setAdvancedQuery(null),
            }
          }
          actions={
            canManage && (
              <MemberListActions
                panel={panel}
                onTogglePanel={togglePanel}
                selectedCount={selectedMembers.size}
                onExport={() => void exportMembers()}
              />
            )
          }
        />
      </div>

      {usersQuery.error && (
        <InlineError
          error={usersQuery.error}
          fallback="Failed to load members"
          onRetry={() => void usersQuery.refetch()}
        />
      )}

      {usersQuery.isPending && <Skeleton rows={5} label="Loading members" className="p-6" />}

      {canManage && selectedMembers.size > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedMembers.size}
          onExport={() => void exportMembers()}
          onClearSelection={() => setSelectedMembers(new Set())}
        />
      )}

      {canManage && panel === 'advanced' && (
        <AdvancedSearchBuilder
          initialQuery={advancedQuery ?? filtersToQuery(filters)}
          onApply={applyQuery}
          onClear={() => {
            setAdvancedQuery(null);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
      )}

      {canManage && panel === 'saved' && (
        <SavedSearches
          onLoadSearch={applyQuery}
          onClose={() => setPanel(null)}
          currentQuery={currentQuery}
        />
      )}

      {viewMode === 'table' ? (
        <MemberTable
          members={members}
          canManage={canManage}
          sort={sort}
          onSort={handleSort}
          selected={selectedMembers}
          onToggleSelect={toggleSelectMember}
          onToggleSelectAll={toggleSelectAll}
          onEdit={editMember}
        />
      ) : (
        <MemberCards
          members={members}
          canManage={canManage}
          selected={selectedMembers}
          onToggleSelect={toggleSelectMember}
          onEdit={editMember}
        />
      )}

      <MemberPagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {members.length === 0 && usersQuery.isSuccess && (
        <MemberEmptyState filtersActive={filtersActive} onClearFilters={clearAllFilters} />
      )}

      <ErrorToast message={toast} onDismiss={clearToast} />

      {canManage && (
        <AddEditMemberModal
          isOpen={editing !== null}
          onClose={() => setEditing(null)}
          member={editing?.member ?? null}
        />
      )}
    </div>
  );
}
