'use client';

import { useMemo, useRef, useState } from 'react';
import { GROUP_TYPES, type GroupType, type StaffGroupSummary } from '@embrace/shared';
import { useRouter } from 'next/navigation';
import { useIsStaff } from '@/lib/auth/AuthProvider';
import { getErrorMessage } from '@/lib/errors';
import { useFocusAfterRemoval } from '@/lib/hooks/useFocusAfterRemoval';
import { enumOptions } from '@/lib/members/display';
import { useGroups, useUpdateGroup } from '@/lib/queries/groups';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';
import GroupDialog from './GroupDialog';
import GroupList from './GroupList';
import OwnGroups from './OwnGroups';

type Status = 'active' | 'inactive' | 'all';

const selectClass =
  'px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500';
const TYPE_OPTIONS = enumOptions(GROUP_TYPES);
const STATUS_OPTIONS: [Status, string][] = [
  ['active', 'Active'],
  ['inactive', 'Archived'],
  ['all', 'All'],
];

/**
 * The `/groups` route: the directory of groups for everyone and the user's own groups. Staff
 * also filter by type and status, create groups, and archive or restore them.
 */
export default function GroupsPage() {
  const staff = useIsStaff();
  const router = useRouter();
  const [type, setType] = useState<GroupType | ''>('');
  const [status, setStatus] = useState<Status>('active');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const directoryRef = useRef<HTMLHeadingElement>(null);
  const params = useMemo(
    () => (staff ? { type: type || undefined, status } : {}),
    [staff, type, status],
  );
  const { data, error, isPending, isPlaceholderData, refetch } = useGroups(params);
  const updateGroup = useUpdateGroup();
  // A row archived out of the Active filter (or restored out of Archived) leaves the list: focus
  // then goes to the list heading rather than to the page.
  const focus = useFocusAfterRemoval(
    (data ?? []).map((g) => g.id),
    directoryRef,
  );

  const toggleArchived = async (group: StaffGroupSummary) => {
    if (busyId) return;
    setActionError('');
    setBusyId(group.id);
    if (status !== 'all') focus.expectRemoval(group.id, { toNext: false });
    try {
      await updateGroup.mutateAsync({ id: group.id, input: { isActive: !group.isActive } });
    } catch (err: unknown) {
      focus.cancel();
      setActionError(getErrorMessage(err, 'Failed to update the group'));
    } finally {
      setBusyId(null);
    }
  };

  let body;
  if (error && !data) {
    body = (
      <InlineError
        error={error}
        fallback="Failed to load the groups"
        onRetry={() => void refetch()}
      />
    );
  } else if (isPending || !data) {
    body = <Skeleton rows={3} label="Loading groups" className="p-4" />;
  } else if (data.length === 0) {
    body = <p className="px-4 py-6 text-sm text-gray-600">No groups to show.</p>;
  } else {
    body = (
      <GroupList
        groups={data}
        onToggleArchived={staff ? (g) => void toggleArchived(g) : undefined}
        busyId={busyId}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold text-gray-900 focus:outline-hidden"
        >
          Groups
        </h1>
        {staff && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            New Group
          </button>
        )}
      </div>

      <section
        aria-labelledby="groups-directory"
        aria-busy={isPlaceholderData}
        className="bg-white shadow-sm rounded-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b">
          <h2
            id="groups-directory"
            ref={directoryRef}
            tabIndex={-1}
            className="text-lg font-medium text-gray-900 focus:outline-hidden"
          >
            Directory
          </h2>
          {staff && (
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="groups-type">
                Type
              </label>
              <select
                id="groups-type"
                value={type}
                onChange={(e) => setType(e.target.value as GroupType | '')}
                className={selectClass}
              >
                <option value="">All types</option>
                {TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="groups-status">
                Status
              </label>
              <select
                id="groups-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className={selectClass}
              >
                {STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {actionError && (
          <p role="alert" className="px-4 py-2 text-sm text-red-700">
            {actionError}
          </p>
        )}
        {body}
      </section>

      <div className="bg-white shadow-sm rounded-lg px-4 pb-4 mt-6 pt-1">
        <OwnGroups headingId="groups-mine" />
      </div>

      {creating && (
        <GroupDialog
          onClose={() => setCreating(false)}
          onSaved={(group) => {
            setCreating(false);
            router.push(`/groups/${encodeURIComponent(group.id)}`);
          }}
          fallbackFocus={headingRef}
        />
      )}
    </div>
  );
}
