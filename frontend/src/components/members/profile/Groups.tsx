import Link from 'next/link';
import { formatLocalDate } from '@/lib/format/date';
import { groupRoleLabel, groupTypeLabel } from '@/lib/groups/display';
import type { MemberDetails } from '@/types/domain';

/** The profile's Groups tab (staff): every membership, archived groups and paused ones marked. */
export default function Groups({ member }: { member: MemberDetails }) {
  const memberships = member.groupMemberships ?? [];
  return (
    <section aria-labelledby="profile-groups-heading">
      <h2 id="profile-groups-heading" className="text-lg font-medium text-gray-900 mb-3">
        Groups
      </h2>
      {memberships.length === 0 ? (
        <p className="text-sm text-gray-600">
          {member.name} is not in any group. Add them from a group&apos;s page.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {memberships.map(({ group, role, joinDate, isActive }) => (
            <li key={group.id} className="py-2 flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <Link
                  href={`/groups/${encodeURIComponent(group.id)}`}
                  className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
                >
                  {group.name}
                </Link>
                <span className="ml-2 text-sm text-gray-600">
                  {groupTypeLabel(group.type)}
                  {!group.isActive && ' · Archived group'}
                  {!isActive && ' · Membership paused'}
                </span>
              </span>
              <span className="text-sm text-gray-700">
                {groupRoleLabel(role)} · joined {formatLocalDate(joinDate)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
