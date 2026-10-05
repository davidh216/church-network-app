// File: frontend/src/components/members/MemberList.tsx
'use client';

import { useCallback, useState } from 'react';
import { DEFAULT_USER_PAGE_SIZE, type UserSortField } from '@embrace/shared';
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
import { useUsers } from '../../lib/queries/users';
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
import ErrorToast from '../ui/ErrorToast';
import InlineError from '../ui/InlineError';
import Skeleton from '../ui/Skeleton';
import { downloadBlob } from '../../lib/download';
import { getErrorMessage } from '../../lib/errors';
import type { Member, SearchQuery } from '../../types/domain';

// The advanced search runs on the server only from F5 (POST /api/users/search); until then
// the Advanced Search and Saved Searches buttons stay hidden behind this flag.
const ADVANCED_SEARCH_ENABLED = false; // hidden until the search UI exists (gameplan 2.4 / F038)

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
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [toast, setToast] = useState('');
  const [advancedQuery, setAdvancedQuery] = useState<SearchQuery | null>(null);

  // The search box updates at once; the query follows 300 ms after the last keystroke.
  const search = useDebouncedValue(filters.search.trim());
  const queryFilters = { ...filters, search };
  const filterKey = JSON.stringify([queryFilters, sort, pageSize]);
  const [page, setPage] = useResettingPage(filterKey);
  const usersQuery = useUsers(buildListParams(queryFilters, sort, page, pageSize, canManage));
  const members = usersQuery.data?.users ?? [];
  const total = usersQuery.data?.total ?? 0;
  const pageIds = members.map((m) => m.id);
  const filtersActive = hasActiveFilters(filters);
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
          actions={
            <>
              {ADVANCED_SEARCH_ENABLED && (
                <button
                  type="button"
                  onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    showAdvancedSearch
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Advanced Search
                </button>
              )}
              {ADVANCED_SEARCH_ENABLED && (
                <button
                  type="button"
                  onClick={() => setShowSavedSearches(!showSavedSearches)}
                  className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Saved Searches
                </button>
              )}
              {canManage && selectedMembers.size > 0 && (
                <button
                  type="button"
                  onClick={() => void exportMembers()}
                  className="px-4 py-2 text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 rounded-md transition-colors"
                >
                  Export Selected ({selectedMembers.size})
                </button>
              )}
            </>
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

      {ADVANCED_SEARCH_ENABLED && showAdvancedSearch && (
        <AdvancedSearchBuilder
          onApplyQuery={setAdvancedQuery}
          onClose={() => setShowAdvancedSearch(false)}
        />
      )}

      {ADVANCED_SEARCH_ENABLED && showSavedSearches && (
        <SavedSearches
          onLoadSearch={(query) => {
            setAdvancedQuery(query);
            setShowSavedSearches(false);
          }}
          onClose={() => setShowSavedSearches(false)}
          currentQuery={advancedQuery}
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
