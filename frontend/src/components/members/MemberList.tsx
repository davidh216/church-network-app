// File: frontend/src/components/members/MemberList.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
  type MemberFilters,
  type MemberSort,
} from '../../lib/members/filters';
import { useUsers } from '../../lib/queries/users';
import AddEditMemberModal from './AddEditMemberModal';
import AdvancedSearchBuilder from './AdvancedSearchBuilder';
import SavedSearches from './SavedSearches';
import BulkActionsToolbar from './BulkActionsToolbar';
import SortableHeader from './SortableHeader';
import InlineError from '../ui/InlineError';
import Pagination from '../ui/Pagination';
import Skeleton from '../ui/Skeleton';

import { getErrorMessage } from '../../lib/errors';
import type { Member, SearchQuery } from '../../types/domain';

// The advanced search runs on the server only from F5 (POST /api/users/search); until then
// the Advanced Search and Saved Searches buttons stay hidden behind this flag.
const ADVANCED_SEARCH_ENABLED = false; // hidden until the search UI exists (gameplan 2.4 / F038)

const TOAST_TIMEOUT_MS = 6000;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** The `/members` route body; staff add and edit members in place, profiles are links. */
export default function MemberList() {
  // Selection, export, profiles, editing and every filter but the name search are
  // staff-only; members get the name directory.
  const canManage = useIsStaff();
  const [filters, setFilters] = useState<MemberFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<MemberSort | null>(null);
  const [pageSize, setPageSize] = useState(DEFAULT_USER_PAGE_SIZE);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
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

  const setFilter = (key: keyof MemberFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), TOAST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleSort = (key: UserSortField) => setSort((prev) => nextSort(prev, key));

  const toggleSelectMember = (memberId: string) => {
    setSelectedMembers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => setSelectedMembers((prev) => toggleAllOnPage(prev, pageIds));

  const clearAllFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAdvancedQuery(null);
    setSort(null);
  };

  const exportMembers = async () => {
    try {
      const { blob, filename } = await exportUsers(Array.from(selectedMembers));
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setToast(getErrorMessage(err, 'Export failed'));
    }
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-medium text-gray-900">Church Members</h2>
            <span className="text-sm text-gray-500">({total} total)</span>
            {selectedMembers.size > 0 && (
              <span className="text-sm text-blue-600 font-medium">
                {selectionLabel(selectedMembers, pageIds)}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-100 rounded-md p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'table' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                }`}
                title="Table View"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'cards' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
                }`}
                title="Card View"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>

            {canManage && (
              <button
                onClick={() => setEditing({ member: null })}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span>Add Member</span>
              </button>
            )}
          </div>
        </div>

        {/* Enhanced Search and Filter Section */}
        <div className="mt-4 space-y-4">
          {/* Quick Search Bar */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by name, email, phone, or bio..."
                  aria-label="Search members"
                  value={filters.search}
                  onChange={(e) => setFilter('search', e.target.value)}
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

            <div className="flex flex-wrap gap-2">
              {ADVANCED_SEARCH_ENABLED && (
                <button
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
                  onClick={() => setShowSavedSearches(!showSavedSearches)}
                  className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Saved Searches
                </button>
              )}

              {canManage && selectedMembers.size > 0 && (
                <button
                  onClick={() => exportMembers()}
                  className="px-4 py-2 text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 rounded-md transition-colors"
                >
                  Export Selected ({selectedMembers.size})
                </button>
              )}
            </div>
          </div>

          {/* Quick Filters (staff only: the API lets members search by name alone) */}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Role"
                value={filters.role}
                onChange={(e) => setFilter('role', e.target.value)}
                className={filterClass}
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="leader">Leader</option>
                <option value="member">Member</option>
              </select>

              <select
                aria-label="Membership stage"
                value={filters.stage}
                onChange={(e) => setFilter('stage', e.target.value)}
                className={filterClass}
              >
                <option value="all">All Stages</option>
                <option value="leader">Leader</option>
                <option value="core_member">Core Member</option>
                <option value="active_member">Active Member</option>
                <option value="new_member">New Member</option>
                <option value="visitor">Visitor</option>
                <option value="at_risk">At Risk</option>
                <option value="inactive">Inactive</option>
              </select>

              <select
                aria-label="Risk level"
                value={filters.risk}
                onChange={(e) => setFilter('risk', e.target.value)}
                className={filterClass}
              >
                <option value="all">All Risk Levels</option>
                <option value="low">Low Risk</option>
                <option value="medium">Medium Risk</option>
                <option value="high">High Risk</option>
              </select>

              <select
                aria-label="Status"
                value={filters.status}
                onChange={(e) => setFilter('status', e.target.value)}
                className={filterClass}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              <input
                type="date"
                aria-label="Joined from"
                value={filters.joinedFrom}
                onChange={(e) => setFilter('joinedFrom', e.target.value)}
                className={filterClass}
              />

              <input
                type="date"
                aria-label="Joined to (inclusive)"
                value={filters.joinedTo}
                onChange={(e) => setFilter('joinedTo', e.target.value)}
                className={filterClass}
              />

              <button
                onClick={clearAllFilters}
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

          {/* Active Filters Display */}
          {(filtersActive || sort) && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-gray-500">Active filters:</span>
              {filters.search && (
                <FilterChip
                  label={`Search: ${filters.search}`}
                  onClear={() => setFilter('search', '')}
                />
              )}
              {filters.role !== 'all' && (
                <FilterChip
                  label={`Role: ${filters.role}`}
                  onClear={() => setFilter('role', 'all')}
                />
              )}
              {filters.stage !== 'all' && (
                <FilterChip
                  label={`Stage: ${filters.stage.replace('_', ' ')}`}
                  onClear={() => setFilter('stage', 'all')}
                />
              )}
              {sort && (
                <FilterChip
                  label={`Sorted by: ${sort.key} ${sort.order}`}
                  onClear={() => setSort(null)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {usersQuery.error && (
        <InlineError
          error={usersQuery.error}
          fallback="Failed to load members"
          onRetry={() => void usersQuery.refetch()}
        />
      )}

      {usersQuery.isPending && <Skeleton rows={5} label="Loading members" className="p-6" />}

      {/* Bulk Actions Toolbar */}
      {canManage && selectedMembers.size > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedMembers.size}
          onExport={() => void exportMembers()}
          onClearSelection={() => setSelectedMembers(new Set())}
        />
      )}

      {/* Advanced Search Builder */}
      {ADVANCED_SEARCH_ENABLED && showAdvancedSearch && (
        <AdvancedSearchBuilder
          onApplyQuery={setAdvancedQuery}
          onClose={() => setShowAdvancedSearch(false)}
        />
      )}

      {/* Saved Searches */}
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

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {canManage && (
                  <th scope="col" className="px-6 py-3 w-12">
                    <input
                      type="checkbox"
                      aria-label="Select all members on this page"
                      checked={pageIds.length > 0 && pageIds.every((id) => selectedMembers.has(id))}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </th>
                )}
                <SortableHeader label="Member" field="name" sort={sort} onSort={handleSort} />
                {canManage && (
                  <SortableHeader label="Contact" field="email" sort={sort} onSort={handleSort} />
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                {canManage && (
                  <>
                    <SortableHeader
                      label="Engagement"
                      field="engagementScore"
                      sort={sort}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Stage"
                      field="membershipStage"
                      sort={sort}
                      onSort={handleSort}
                    />
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </>
                )}
                <SortableHeader
                  label="Joined"
                  field="createdAt"
                  sort={sort}
                  onSort={handleSort}
                  sortable={canManage}
                />
                {canManage && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {members.map((member) => (
                <tr
                  key={member.id}
                  className={`hover:bg-gray-50 ${
                    selectedMembers.has(member.id) ? 'bg-blue-50' : ''
                  }`}
                >
                  {canManage && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedMembers.has(member.id)}
                        onChange={() => toggleSelectMember(member.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center shrink-0">
                        {member.avatar ? (
                          <img
                            src={member.avatar}
                            alt={member.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <span className="text-sm font-medium text-gray-600">
                            {member.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{member.name}</div>
                        {member.bio && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {member.bio}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {canManage && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{member.email}</div>
                      {member.phone && <div className="text-sm text-gray-500">{member.phone}</div>}
                      {member.lastLoginAt && (
                        <div className="text-xs text-gray-400">
                          Last login: {new Date(member.lastLoginAt).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {member.roles && member.roles.length > 0 ? (
                        member.roles.map((userRole) => (
                          <span
                            key={userRole.role.id}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {userRole.role.name}
                          </span>
                        ))
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          member
                        </span>
                      )}
                    </div>
                  </td>
                  {canManage && (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {member.engagement ? (
                          <div className="flex items-center space-x-2">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                                member.engagement.engagementScore >= 80
                                  ? 'bg-green-100 text-green-800'
                                  : member.engagement.engagementScore >= 50
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {member.engagement.engagementScore}%
                            </div>
                            <div
                              className={`w-2 h-2 rounded-full ${
                                member.engagement.riskLevel === 'low'
                                  ? 'bg-green-400'
                                  : member.engagement.riskLevel === 'medium'
                                    ? 'bg-yellow-400'
                                    : 'bg-red-400'
                              }`}
                              title={`${member.engagement.riskLevel} risk`}
                            ></div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {member.engagement?.membershipStage ? (
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              member.engagement.membershipStage === 'leader'
                                ? 'bg-purple-100 text-purple-800'
                                : member.engagement.membershipStage === 'core_member'
                                  ? 'bg-blue-100 text-blue-800'
                                  : member.engagement.membershipStage === 'active_member'
                                    ? 'bg-green-100 text-green-800'
                                    : member.engagement.membershipStage === 'new_member'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : member.engagement.membershipStage === 'visitor'
                                        ? 'bg-gray-100 text-gray-800'
                                        : member.engagement.membershipStage === 'at_risk'
                                          ? 'bg-orange-100 text-orange-800'
                                          : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {member.engagement.membershipStage.replace('_', ' ')}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">Unknown</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            member.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {member.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>{new Date(member.createdAt).toLocaleDateString()}</div>
                    {member.membershipDate && member.membershipDate !== member.createdAt && (
                      <div className="text-xs text-gray-400">
                        Member: {new Date(member.membershipDate).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <Link
                          href={`/members/${encodeURIComponent(member.id)}`}
                          className="text-green-600 hover:text-green-900"
                          title="View Profile"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => setEditing({ member })}
                          className="text-blue-600 hover:text-blue-900"
                          title="Edit Member"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Card View */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
          {members.map((member) => (
            <div
              key={member.id}
              className={`bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow relative ${
                selectedMembers.has(member.id) ? 'ring-2 ring-blue-500 border-blue-300' : ''
              }`}
            >
              {/* Selection checkbox */}
              {canManage && (
                <div className="absolute top-4 right-4">
                  <input
                    type="checkbox"
                    checked={selectedMembers.has(member.id)}
                    onChange={() => toggleSelectMember(member.id)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>
              )}

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center shrink-0">
                  {member.avatar ? (
                    <img
                      src={member.avatar}
                      alt={member.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-lg text-gray-600">
                      {member.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-medium text-gray-900 truncate">{member.name}</h3>
                  {member.email && <p className="text-sm text-gray-500 truncate">{member.email}</p>}
                  {member.phone && <p className="text-sm text-gray-500">{member.phone}</p>}

                  <div className="flex flex-wrap gap-1 mt-2">
                    {member.roles && member.roles.length > 0 ? (
                      member.roles.map((userRole) => (
                        <span
                          key={userRole.role.id}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {userRole.role.name}
                        </span>
                      ))
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        member
                      </span>
                    )}

                    {canManage && (
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          member.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {member.isActive ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </div>

                  {member.bio && (
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">{member.bio}</p>
                  )}

                  <div className="flex items-center justify-between mt-4">
                    <span className="text-xs text-gray-500">
                      Joined {new Date(member.createdAt).toLocaleDateString()}
                    </span>
                    {canManage && (
                      <div className="flex space-x-2">
                        <Link
                          href={`/members/${encodeURIComponent(member.id)}`}
                          className="text-green-600 hover:text-green-900 text-sm font-medium"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => setEditing({ member })}
                          className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <Pagination
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={setPageSize}
          itemLabel="members"
        />
      )}

      {members.length === 0 && usersQuery.isSuccess && (
        <div className="px-6 py-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No members found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {filtersActive
              ? 'No members match your current search criteria. Try adjusting your filters.'
              : 'Get started by adding your first member to the church community.'}
          </p>
          {filtersActive && (
            <div className="mt-6">
              <button
                onClick={clearAllFilters}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error toast (export failures) */}
      {toast && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 flex items-start gap-3 max-w-sm rounded-md bg-red-600 px-4 py-3 text-sm text-white shadow-lg"
        >
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast('')}
            className="text-white/80 hover:text-white"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

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

const filterClass =
  'px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

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
