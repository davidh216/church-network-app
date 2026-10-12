'use client';

import Link from 'next/link';
import { useOwnGroups } from '@/lib/queries/groups';
import { groupRoleLabel, groupTypeLabel, scheduleText } from '@/lib/groups/display';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';

interface OwnGroupsProps {
  /** The section heading ("My groups" by default). */
  heading?: string;
  headingId: string;
}

/** The signed-in user's own active groups with their role in each (GET /api/groups?mine=true). */
export default function OwnGroups({ heading = 'My groups', headingId }: OwnGroupsProps) {
  const { data, error, isPending, refetch } = useOwnGroups();

  let body;
  if (error && !data) {
    body = (
      <InlineError
        error={error}
        fallback="Failed to load your groups"
        onRetry={() => void refetch()}
      />
    );
  } else if (isPending || !data) {
    body = <Skeleton rows={2} label="Loading your groups" />;
  } else if (data.length === 0) {
    body = <p className="text-sm text-gray-600">You are not in any group yet.</p>;
  } else {
    body = (
      <ul className="divide-y divide-gray-200">
        {data.map(({ group, role }) => (
          <li key={group.id} className="py-2 flex flex-wrap items-baseline justify-between gap-2">
            <span>
              <Link
                href={`/groups/${encodeURIComponent(group.id)}`}
                className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
              >
                {group.name}
              </Link>
              <span className="ml-2 text-sm text-gray-600">
                {[groupTypeLabel(group.type), scheduleText(group)].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="text-sm text-gray-700">{groupRoleLabel(role)}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby={headingId} className="mt-6">
      <h2 id={headingId} className="text-lg font-medium text-gray-900 mb-2">
        {heading}
      </h2>
      {body}
    </section>
  );
}
