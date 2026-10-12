'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GROUP_MEMBER_ROLES, type GroupMemberRole, type StaffGroupDetail } from '@embrace/shared';
import { getErrorMessage } from '@/lib/errors';
import { formatLocalDate } from '@/lib/format/date';
import { groupRoleLabel } from '@/lib/groups/display';
import { useRemoveGroupMember, useUpdateGroupMember } from '@/lib/queries/groups';

const smallButton =
  'px-2.5 py-1 text-sm font-medium rounded-md border focus:outline-hidden focus:ring-2 disabled:opacity-50';

/**
 * Staff: the group's roster, leaders first. Each row changes the member's role, pauses or
 * resumes the membership, or removes it (after a second click to confirm).
 */
export default function GroupRoster({ group }: { group: StaffGroupDetail }) {
  const update = useUpdateGroupMember();
  const remove = useRemoveGroupMember();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState('');
  const busy = update.isPending || remove.isPending;

  const run = async (change: () => Promise<unknown>, fallback: string) => {
    setError('');
    try {
      await change();
    } catch (err: unknown) {
      setError(getErrorMessage(err, fallback));
    }
  };

  const setRole = (userId: string, role: GroupMemberRole) =>
    run(
      () => update.mutateAsync({ groupId: group.id, userId, input: { role } }),
      'Failed to change the role',
    );
  const setActive = (userId: string, isActive: boolean) =>
    run(
      () => update.mutateAsync({ groupId: group.id, userId, input: { isActive } }),
      'Failed to update the membership',
    );
  const removeMember = (userId: string) =>
    run(async () => {
      await remove.mutateAsync({ groupId: group.id, userId });
      setConfirming(null);
    }, 'Failed to remove the member');

  return (
    <section aria-labelledby="group-roster" className="mt-6">
      <h2 id="group-roster" className="text-lg font-medium text-gray-900 mb-2">
        Roster ({group.memberCount} active)
      </h2>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {group.roster.length === 0 ? (
        <p className="text-sm text-gray-600">Nobody is in this group yet.</p>
      ) : (
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
          {group.roster.map((row) => {
            const roleId = `roster-role-${row.userId}`;
            return (
              <li
                key={row.userId}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <Link
                    href={`/members/${encodeURIComponent(row.userId)}`}
                    className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <p className="text-xs text-gray-600">
                    Joined {formatLocalDate(row.joinDate)}
                    {!row.isActive && ' · Membership paused'}
                    {!row.userIsActive && ' · Account deactivated'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={roleId} className="sr-only">
                    Role of {row.name}
                  </label>
                  <select
                    id={roleId}
                    value={row.role}
                    disabled={busy}
                    onChange={(e) => void setRole(row.userId, e.target.value as GroupMemberRole)}
                    className="px-2 py-1 text-sm border border-gray-300 rounded-md bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    {GROUP_MEMBER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {groupRoleLabel(role)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setActive(row.userId, !row.isActive)}
                    aria-label={`${row.isActive ? 'Pause' : 'Resume'} membership of ${row.name}`}
                    className={`${smallButton} text-gray-700 bg-white border-gray-300 hover:bg-gray-50 focus:ring-blue-500`}
                  >
                    {row.isActive ? 'Pause' : 'Resume'}
                  </button>
                  {confirming === row.userId ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeMember(row.userId)}
                        className={`${smallButton} text-white bg-red-600 border-red-600 hover:bg-red-700 focus:ring-red-500`}
                      >
                        Confirm remove {row.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className={`${smallButton} text-gray-700 bg-gray-100 border-gray-200 hover:bg-gray-200 focus:ring-gray-500`}
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirming(row.userId)}
                      aria-label={`Remove ${row.name}`}
                      className={`${smallButton} text-red-700 bg-white border-red-300 hover:bg-red-50 focus:ring-red-500`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
