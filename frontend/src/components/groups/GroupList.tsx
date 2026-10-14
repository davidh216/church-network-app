'use client';

import Link from 'next/link';
import { isStaffGroup, type GroupSummary, type StaffGroupSummary } from '@embrace/shared';
import { groupTypeLabel, leadersText, scheduleText } from '@/lib/groups/display';

interface GroupListProps {
  groups: Array<GroupSummary | StaffGroupSummary>;
  /** Staff only: archive or restore a group. */
  onToggleArchived?: (group: StaffGroupSummary) => void;
  /** The id of the group being archived or restored. */
  busyId?: string | null;
}

const buttonClass =
  'px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 aria-disabled:opacity-50';

/**
 * The groups directory: each group's name (linking to its page), type, schedule, location and
 * leaders. Staff rows also show the member count and whether the group is archived, with
 * Archive or Restore.
 */
export default function GroupList({ groups, onToggleArchived, busyId }: GroupListProps) {
  return (
    <ul className="divide-y divide-gray-200">
      {groups.map((group) => {
        const schedule = scheduleText(group);
        const leaders = leadersText(group.leaders);
        const staff = isStaffGroup(group) ? group : null;
        return (
          <li key={group.id} className="px-4 py-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/groups/${encodeURIComponent(group.id)}`}
                  className="text-base font-medium text-blue-700 hover:text-blue-900 hover:underline"
                >
                  {group.name}
                </Link>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                  {groupTypeLabel(group.type)}
                </span>
                {staff && !staff.isActive && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                    Archived
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600">
                {[schedule, group.location].filter(Boolean).join(' · ') || 'No schedule set'}
              </p>
              <p className="text-sm text-gray-600">
                {leaders ? `Led by ${leaders}` : 'No leader yet'}
                {staff &&
                  ` · ${staff.memberCount} ${staff.memberCount === 1 ? 'member' : 'members'}`}
              </p>
            </div>
            {staff && onToggleArchived && (
              <button
                type="button"
                className={buttonClass}
                // Not `disabled`: that would drop the keyboard focus to the page.
                aria-disabled={busyId === staff.id || undefined}
                onClick={() => busyId !== staff.id && onToggleArchived(staff)}
                aria-label={`${staff.isActive ? 'Archive' : 'Restore'} ${staff.name}`}
              >
                {staff.isActive ? 'Archive' : 'Restore'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
