import type { MemberAttendanceSummary } from '@embrace/shared';
import { attendanceRate, serviceTypesLabel } from '@/lib/members/attendance';
import { stageLabel } from '@/lib/members/display';
import { formatDay } from '@/lib/members/profile';
import { EmptyTab, pillClass } from './Field';

interface AttendanceSummaryProps {
  summary: MemberAttendanceSummary;
  /** "You" on a member's own profile, "This member" for staff. */
  subject: string;
}

/**
 * How many services of the counted types a member attended in the window, and the list of those
 * services, newest first. Service dates are calendar days, shown as their UTC day.
 */
export default function AttendanceSummary({ summary, subject }: AttendanceSummaryProps) {
  const rate = attendanceRate(summary);
  const types = serviceTypesLabel(summary.types);
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">
        {subject} attended <strong>{summary.attendedCount}</strong> of{' '}
        <strong>{summary.serviceCount}</strong> {types} services between {formatDay(summary.from)}{' '}
        and {formatDay(summary.to)}
        {rate !== null && ` (${rate}%)`}.
      </p>
      {summary.attended.length > 0 ? (
        <ul aria-label="Services attended" className="divide-y divide-gray-100">
          {summary.attended.map((service) => (
            <li key={service.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-900">
                {formatDay(service.date)}
                {service.title && <span className="text-gray-600"> · {service.title}</span>}
              </span>
              <span className={`${pillClass} bg-green-100 text-green-800`}>
                {stageLabel(service.type)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyTab>No services attended in this period</EmptyTab>
      )}
    </div>
  );
}
