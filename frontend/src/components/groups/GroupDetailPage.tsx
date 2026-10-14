'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isStaffGroup, type StaffGroupDetail } from '@embrace/shared';
import { isApiError } from '@/lib/api/client';
import { useHasRole } from '@/lib/auth/AuthProvider';
import { getErrorMessage } from '@/lib/errors';
import { groupRoleLabel, groupTypeLabel, scheduleText } from '@/lib/groups/display';
import { useGroup, useUpdateGroup } from '@/lib/queries/groups';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';
import AddGroupMember from './AddGroupMember';
import DeleteGroupDialog from './DeleteGroupDialog';
import GroupDialog from './GroupDialog';
import GroupRoster from './GroupRoster';

const cardClass = 'p-5 border border-gray-200 shadow-sm rounded-md bg-white';
const backLink = 'text-sm font-medium text-blue-600 hover:text-blue-800';
const outlineButton =
  'px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 aria-disabled:opacity-50';

/**
 * The `/groups/[id]` route: a group's details for everyone (members only reach active groups).
 * Staff also get the roster, adding members, editing and archiving; admins can delete.
 */
export default function GroupDetailPage({ id }: { id: string }) {
  const { data: group, error, isPending, refetch } = useGroup(id);
  const admin = useHasRole('admin');
  const router = useRouter();
  const updateGroup = useUpdateGroup();
  const [open, setOpen] = useState<'edit' | 'delete' | null>(null);
  const [actionError, setActionError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  if (isPending) {
    return (
      <div className={cardClass}>
        <Skeleton rows={4} label="Loading the group" />
      </div>
    );
  }
  if (error || !group) {
    const retryable = error && !(isApiError(error) && error.status === 404);
    return (
      <div className={`${cardClass} space-y-4`}>
        <InlineError
          error={error}
          fallback="Group not found"
          onRetry={retryable ? () => void refetch() : undefined}
        />
        <Link href="/groups" className={backLink}>
          ← Back to groups
        </Link>
      </div>
    );
  }

  const staff: StaffGroupDetail | null = isStaffGroup(group) ? (group as StaffGroupDetail) : null;
  const schedule = scheduleText(group);
  const facts: Array<[string, string | null]> = [
    ['Type', groupTypeLabel(group.type)],
    ['Meets', schedule],
    ['Location', group.location],
    [
      'Leaders',
      group.leaders.map((l) => `${l.name} (${groupRoleLabel(l.role)})`).join(', ') || 'None yet',
    ],
  ];

  const toggleArchived = async () => {
    // Never `disabled` while saving: that would drop the keyboard focus to the page.
    if (!staff || updateGroup.isPending) return;
    setActionError('');
    try {
      await updateGroup.mutateAsync({ id: staff.id, input: { isActive: !staff.isActive } });
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Failed to update the group'));
    }
  };

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4 mb-4">
        <div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-bold text-gray-900 focus:outline-hidden"
          >
            {group.name}
          </h1>
          {staff && !staff.isActive && (
            <p className="mt-1 text-sm font-medium text-yellow-800">
              Archived: members no longer see this group.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {staff && (
            <>
              <button type="button" className={outlineButton} onClick={() => setOpen('edit')}>
                Edit
              </button>
              <button
                type="button"
                className={outlineButton}
                aria-disabled={updateGroup.isPending || undefined}
                onClick={() => void toggleArchived()}
              >
                {staff.isActive ? 'Archive' : 'Restore'}
              </button>
              {admin && (
                <button
                  type="button"
                  onClick={() => setOpen('delete')}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-hidden focus:ring-2 focus:ring-red-500"
                >
                  Delete
                </button>
              )}
            </>
          )}
          <Link href="/groups" className={backLink}>
            ← Back to groups
          </Link>
        </div>
      </div>
      {actionError && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {actionError}
        </p>
      )}
      {group.description && (
        <p className="mb-4 text-gray-800 whitespace-pre-line">{group.description}</p>
      )}
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        {facts
          .filter(([, value]) => !!value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="font-medium text-gray-700">{label}</dt>
              <dd className="text-gray-900">{value}</dd>
            </div>
          ))}
      </dl>

      {staff && (
        <>
          <GroupRoster group={staff} />
          <AddGroupMember
            groupId={staff.id}
            groupName={staff.name}
            rosterIds={staff.roster.map((r) => r.userId)}
          />
        </>
      )}

      {staff && open === 'edit' && (
        <GroupDialog
          group={staff}
          onClose={() => setOpen(null)}
          onSaved={() => setOpen(null)}
          fallbackFocus={headingRef}
        />
      )}
      {staff && open === 'delete' && (
        <DeleteGroupDialog
          group={staff}
          onClose={() => setOpen(null)}
          onDeleted={() => router.replace('/groups')}
          fallbackFocus={headingRef}
        />
      )}
    </div>
  );
}
