'use client';

import Link from 'next/link';
import { formatLocalDate } from '@/lib/format/date';
import type { User } from '@/types/domain';
import OwnAttendance from './OwnAttendance';

/**
 * A member's own profile at `/members/<own id>`. The detailed CRM view (member-details) is
 * staff-only, so this shows the self projection the session already loaded from /auth/me.
 */
export default function OwnProfile({ user }: { user: User }) {
  const rows: Array<[string, string | null | undefined]> = [
    ['Email', user.email],
    ['Phone', user.phone],
    ['About', user.bio],
    ['Roles', user.roles.length ? user.roles.map((r) => r.role.name).join(', ') : 'member'],
    // A real membership date or nothing: the account's creation date is not a membership date.
    ['Member since', formatLocalDate(user.membershipDate)],
  ];
  return (
    <section className="p-5 border border-gray-200 shadow-sm rounded-md bg-white">
      <div className="flex items-start justify-between border-b border-gray-200 pb-4 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
        <Link href="/" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          ← Back to dashboard
        </Link>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        {rows
          .filter(([, value]) => !!value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="font-medium text-gray-700">{label}</dt>
              <dd className="text-gray-900">{value}</dd>
            </div>
          ))}
      </dl>
      <OwnAttendance />
    </section>
  );
}
