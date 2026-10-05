'use client';

import { useOwnAttendance } from '@/lib/queries/memberDetails';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';
import AttendanceSummary from './profile/AttendanceSummary';

/** A member's own attendance over the last 12 months (GET /api/member-details/me/attendance). */
export default function OwnAttendance() {
  const { data, isPending, error, refetch } = useOwnAttendance();
  return (
    <section aria-labelledby="own-attendance-heading" className="mt-6 space-y-4">
      <h2 id="own-attendance-heading" className="text-lg font-medium text-gray-900">
        Your Attendance
      </h2>
      {isPending ? (
        <Skeleton rows={2} label="Loading your attendance" />
      ) : error || !data ? (
        <InlineError
          error={error}
          fallback="Could not load your attendance"
          onRetry={() => void refetch()}
        />
      ) : (
        <AttendanceSummary summary={data} subject="You" />
      )}
    </section>
  );
}
