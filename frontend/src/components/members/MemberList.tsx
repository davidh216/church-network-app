// File: frontend/src/components/members/MemberList.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { exportUsers, listUsers } from '../../lib/api/users';
import { useIsStaff } from '../../lib/auth/AuthProvider';
import MemberProfile from './MemberProfile';
import AdvancedSearchBuilder from './AdvancedSearchBuilder';
import SavedSearches from './SavedSearches';
import BulkActionsToolbar from './BulkActionsToolbar';

import { getErrorMessage } from '../../lib/errors';
import type { Member, SearchQuery } from '../../types/domain';

// Pure helpers live at module scope so they are initialised before render uses them.
// The advanced-query evaluator is a stub that matches every member, so the Advanced
// Search button and builder are not rendered while ADVANCED_SEARCH_ENABLED is false.
// Saved Searches only load such queries, so their button is hidden behind the same flag.
const ADVANCED_SEARCH_ENABLED = false; // hidden until the evaluator exists (gameplan 2.4 / F038)

const TOAST_TIMEOUT_MS = 6000;

function evaluateAdvancedQuery(member: Member, query: SearchQuery): boolean {
  void member;
  void query;
  return true;
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

interface MemberListProps {
  onEditMember: (member: Member) => void;
  onAddMember: () => void;
  refreshTrigger: number;
}

export default function MemberList({ onEditMember, onAddMember, refreshTrigger }: MemberListProps) {
  // Selection, export, profiles and editing are staff-only; members get the directory.
  const canManage = useIsStaff();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [membershipStageFilter, setMembershipStageFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [engagementFilter, setEngagementFilter] = useState('all');
  const [riskLevelFilter, setRiskLevelFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState({ start: '', end: '' });
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [advancedQuery, setAdvancedQuery] = useState<SearchQuery | null>(null);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      setMembers(await listUsers());
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load members'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [refreshTrigger]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), TOAST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const filteredMembers = useMemo(
    () =>
      members.filter((member) => {
        // Advanced query takes precedence over basic filters
        if (advancedQuery) {
          return evaluateAdvancedQuery(member, advancedQuery);
        }

        const matchesSearch =
          member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (member.email ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (member.phone && member.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (member.bio && member.bio.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesRole =
          roleFilter === 'all' || member.roles.some((ur) => ur.role.name === roleFilter);

        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'active' && member.isActive) ||
          (statusFilter === 'inactive' && !member.isActive);

        const matchesMembershipStage =
          membershipStageFilter === 'all' ||
          member.engagement?.membershipStage === membershipStageFilter;

        const matchesEngagement =
          engagementFilter === 'all' ||
          (engagementFilter === 'high' && (member.engagement?.engagementScore || 0) >= 80) ||
          (engagementFilter === 'medium' &&
            (member.engagement?.engagementScore || 0) >= 50 &&
            (member.engagement?.engagementScore || 0) < 80) ||
          (engagementFilter === 'low' && (member.engagement?.engagementScore || 0) < 50);

        const matchesRiskLevel =
          riskLevelFilter === 'all' || member.engagement?.riskLevel === riskLevelFilter;

        const matchesDateRange =
          (!dateRangeFilter.start ||
            new Date(member.createdAt) >= new Date(dateRangeFilter.start)) &&
          (!dateRangeFilter.end || new Date(member.createdAt) <= new Date(dateRangeFilter.end));

        return (
          matchesSearch &&
          matchesRole &&
          matchesStatus &&
          matchesMembershipStage &&
          matchesEngagement &&
          matchesRiskLevel &&
          matchesDateRange
        );
      }),
    [
      members,
      advancedQuery,
      searchTerm,
      roleFilter,
      statusFilter,
      membershipStageFilter,
      engagementFilter,
      riskLevelFilter,
      dateRangeFilter,
    ],
  );

  // Apply sorting
  const sortedMembers = useMemo(
    () =>
      [...filteredMembers].sort((a, b) => {
        for (const sort of sortConfig) {
          const aValue = getNestedValue(a, sort.key);
          const bValue = getNestedValue(b, sort.key);

          if (aValue !== bValue) {
            const direction = sort.direction === 'asc' ? 1 : -1;
            if (typeof aValue === 'string' && typeof bValue === 'string') {
              return aValue.localeCompare(bValue) * direction;
            }
            if (typeof aValue === 'number' && typeof bValue === 'number') {
              return (aValue - bValue) * direction;
            }
            if (aValue instanceof Date && bValue instanceof Date) {
              return (aValue.getTime() - bValue.getTime()) * direction;
            }
            return String(aValue ?? '').localeCompare(String(bValue ?? '')) * direction;
          }
        }
        return 0;
      }),
    [filteredMembers, sortConfig],
  );

  // Apply pagination
  const totalPages = Math.ceil(sortedMembers.length / itemsPerPage);
  const paginatedMembers = useMemo(
    () => sortedMembers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [sortedMembers, currentPage, itemsPerPage],
  );

  const handleSort = (key: string) => {
    setSortConfig((prev) => {
      const existing = prev.find((s) => s.key === key);
      if (existing) {
        if (existing.direction === 'asc') {
          return prev.map((s) => (s.key === key ? { ...s, direction: 'desc' as const } : s));
        } else {
          return prev.filter((s) => s.key !== key);
        }
      } else {
        return [...prev, { key, direction: 'asc' as const }];
      }
    });
  };

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

  const toggleSelectAll = () => {
    if (selectedMembers.size === paginatedMembers.length) {
      setSelectedMembers(new Set());
    } else {
      setSelectedMembers(new Set(paginatedMembers.map((m) => m.id)));
    }
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setRoleFilter('all');
    setMembershipStageFilter('all');
    setStatusFilter('all');
    setEngagementFilter('all');
    setRiskLevelFilter('all');
    setDateRangeFilter({ start: '', end: '' });
    setAdvancedQuery(null);
    setSortConfig([]);
    setCurrentPage(1);
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-medium text-gray-900">Church Members</h2>
            <span className="text-sm text-gray-500">
              ({sortedMembers.length} of {members.length})
            </span>
            {selectedMembers.size > 0 && (
              <span className="text-sm text-blue-600 font-medium">
                {selectedMembers.size} selected
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
                onClick={onAddMember}
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
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
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

          {/* Quick Filters */}
          <div className="flex flex-wrap gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="leader">Leader</option>
              <option value="member">Member</option>
            </select>

            {/* Engagement and status are staff-only fields; the member directory has neither. */}
            {canManage && (
              <>
                <select
                  value={membershipStageFilter}
                  onChange={(e) => setMembershipStageFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  value={engagementFilter}
                  onChange={(e) => setEngagementFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Engagement</option>
                  <option value="high">High (80%+)</option>
                  <option value="medium">Medium (50-79%)</option>
                  <option value="low">Low (&lt;50%)</option>
                </select>

                <select
                  value={riskLevelFilter}
                  onChange={(e) => setRiskLevelFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Risk Levels</option>
                  <option value="low">Low Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="high">High Risk</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </>
            )}

            <input
              type="date"
              placeholder="Start Date"
              value={dateRangeFilter.start}
              onChange={(e) => setDateRangeFilter((prev) => ({ ...prev, start: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <input
              type="date"
              placeholder="End Date"
              value={dateRangeFilter.end}
              onChange={(e) => setDateRangeFilter((prev) => ({ ...prev, end: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <button
              onClick={clearAllFilters}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              Clear All
            </button>
          </div>

          {/* Active Filters Display */}
          {(searchTerm ||
            roleFilter !== 'all' ||
            membershipStageFilter !== 'all' ||
            engagementFilter !== 'all' ||
            riskLevelFilter !== 'all' ||
            statusFilter !== 'all' ||
            dateRangeFilter.start ||
            dateRangeFilter.end ||
            sortConfig.length > 0) && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-gray-500">Active filters:</span>
              {searchTerm && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Search: {searchTerm}
                  <button
                    onClick={() => setSearchTerm('')}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              )}
              {roleFilter !== 'all' && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  Role: {roleFilter}
                  <button
                    onClick={() => setRoleFilter('all')}
                    className="ml-1 text-purple-600 hover:text-purple-800"
                  >
                    ×
                  </button>
                </span>
              )}
              {membershipStageFilter !== 'all' && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Stage: {membershipStageFilter.replace('_', ' ')}
                  <button
                    onClick={() => setMembershipStageFilter('all')}
                    className="ml-1 text-green-600 hover:text-green-800"
                  >
                    ×
                  </button>
                </span>
              )}
              {sortConfig.length > 0 && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                  Sorted by: {sortConfig.map((s) => `${s.key} ${s.direction}`).join(', ')}
                  <button
                    onClick={() => setSortConfig([])}
                    className="ml-1 text-orange-600 hover:text-orange-800"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="px-6 py-4 bg-red-50 border-l-4 border-red-400">
          <p className="text-red-700">{error}</p>
        </div>
      )}

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
                  <th className="px-6 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={
                        selectedMembers.size === paginatedMembers.length &&
                        paginatedMembers.length > 0
                      }
                      onChange={toggleSelectAll}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </th>
                )}
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Member</span>
                    {sortConfig.find((s) => s.key === 'name') && (
                      <span className="text-blue-500">
                        {sortConfig.find((s) => s.key === 'name')?.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                {canManage && (
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('email')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Contact</span>
                      {sortConfig.find((s) => s.key === 'email') && (
                        <span className="text-blue-500">
                          {sortConfig.find((s) => s.key === 'email')?.direction === 'asc'
                            ? '↑'
                            : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                {canManage && (
                  <>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('engagement.engagementScore')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Engagement</span>
                        {sortConfig.find((s) => s.key === 'engagement.engagementScore') && (
                          <span className="text-blue-500">
                            {sortConfig.find((s) => s.key === 'engagement.engagementScore')
                              ?.direction === 'asc'
                              ? '↑'
                              : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('engagement.membershipStage')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Stage</span>
                        {sortConfig.find((s) => s.key === 'engagement.membershipStage') && (
                          <span className="text-blue-500">
                            {sortConfig.find((s) => s.key === 'engagement.membershipStage')
                              ?.direction === 'asc'
                              ? '↑'
                              : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </>
                )}
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('createdAt')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Joined</span>
                    {sortConfig.find((s) => s.key === 'createdAt') && (
                      <span className="text-blue-500">
                        {sortConfig.find((s) => s.key === 'createdAt')?.direction === 'asc'
                          ? '↑'
                          : '↓'}
                      </span>
                    )}
                  </div>
                </th>
                {canManage && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedMembers.map((member) => (
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
                        <button
                          onClick={() => setSelectedMember(member.id)}
                          className="text-green-600 hover:text-green-900"
                          title="View Profile"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEditMember(member)}
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
          {paginatedMembers.map((member) => (
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
                        <button
                          onClick={() => setSelectedMember(member.id)}
                          className="text-green-600 hover:text-green-900 text-sm font-medium"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onEditMember(member)}
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

      {/* Pagination Controls */}
      {sortedMembers.length > itemsPerPage && (
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
          <div className="flex-1 flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span>{' '}
                to{' '}
                <span className="font-medium">
                  {Math.min(currentPage * itemsPerPage, sortedMembers.length)}
                </span>{' '}
                of <span className="font-medium">{sortedMembers.length}</span> results
              </p>

              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-l-md"
              >
                Previous
              </button>

              {/* Page Numbers */}
              <div className="flex space-x-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                  if (pageNum > totalPages) return null;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        currentPage === pageNum
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-r-md"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {sortedMembers.length === 0 && !loading && (
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
            {searchTerm ||
            roleFilter !== 'all' ||
            membershipStageFilter !== 'all' ||
            engagementFilter !== 'all' ||
            riskLevelFilter !== 'all' ||
            statusFilter !== 'all' ||
            dateRangeFilter.start ||
            dateRangeFilter.end
              ? 'No members match your current search criteria. Try adjusting your filters.'
              : 'Get started by adding your first member to the church community.'}
          </p>
          {(searchTerm ||
            roleFilter !== 'all' ||
            membershipStageFilter !== 'all' ||
            engagementFilter !== 'all' ||
            riskLevelFilter !== 'all' ||
            statusFilter !== 'all' ||
            dateRangeFilter.start ||
            dateRangeFilter.end) && (
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

      {/* Member Profile Modal */}
      {canManage && selectedMember && (
        <MemberProfile
          memberId={selectedMember}
          onClose={() => setSelectedMember(null)}
          onEdit={(member) => {
            setSelectedMember(null);
            onEditMember(member);
          }}
        />
      )}
    </div>
  );
}
