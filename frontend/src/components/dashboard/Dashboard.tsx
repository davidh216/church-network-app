'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useAuth, useIsStaff } from '@/lib/auth/AuthProvider';
import { formatLocalDate } from '@/lib/format/date';
import DashboardNotice from './DashboardNotice';
import SummaryTiles from './SummaryTiles';

const linkClass = 'block w-full text-left px-3 py-2 rounded-md text-sm';

/** The `/` route: notices, member counts, the signed-in user's profile and quick links. */
export default function Dashboard() {
  const { user } = useAuth();
  const staff = useIsStaff();
  if (!user) return null;
  // A real membership date or nothing: the account's creation date is not a membership date.
  const memberSince = formatLocalDate(user.membershipDate);

  return (
    <div>
      <Suspense fallback={null}>
        <DashboardNotice />
      </Suspense>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Dashboard</h1>
      <section aria-label="Member counts" className="mb-6">
        <SummaryTiles />
      </section>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white overflow-hidden shadow-sm rounded-lg p-5">
          <h2 className="text-lg font-medium text-gray-900">Your Profile</h2>
          <div className="mt-4 space-y-2 text-sm text-gray-600">
            <p>
              <span className="font-medium">Name:</span> {user.name}
            </p>
            <p>
              <span className="font-medium">Email:</span> {user.email}
            </p>
            {user.phone && (
              <p>
                <span className="font-medium">Phone:</span> {user.phone}
              </p>
            )}
            <p>
              <span className="font-medium">Roles:</span>{' '}
              {user.roles.length ? user.roles.map((r) => r.role.name).join(', ') : 'member'}
            </p>
            {memberSince && (
              <p>
                <span className="font-medium">Member since:</span> {memberSince}
              </p>
            )}
          </div>
        </section>
        <section className="bg-white overflow-hidden shadow-sm rounded-lg p-5">
          <h2 className="text-lg font-medium text-gray-900">Quick Links</h2>
          <ul className="mt-4 space-y-3">
            <li>
              <Link
                href="/members"
                className={`${linkClass} bg-blue-50 hover:bg-blue-100 text-blue-700`}
              >
                View Members
              </Link>
            </li>
            <li>
              <Link
                href="/media"
                className={`${linkClass} bg-purple-50 hover:bg-purple-100 text-purple-700`}
              >
                Media Library
              </Link>
            </li>
            {staff && (
              <li>
                <Link
                  href="/analytics"
                  className={`${linkClass} bg-indigo-50 hover:bg-indigo-100 text-indigo-700`}
                >
                  Member Analytics
                </Link>
              </li>
            )}
            <li>
              <Link
                href={`/members/${encodeURIComponent(user.id)}`}
                className={`${linkClass} bg-gray-50 hover:bg-gray-100 text-gray-700`}
              >
                My Profile
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
