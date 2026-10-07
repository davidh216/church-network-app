'use client';

import { useState } from 'react';
import {
  DEFAULT_ATTENDANCE_MONTHS,
  DEFAULT_SCORING_SERVICE_TYPES,
  SERVICE_TYPES,
  type ServiceType,
} from '@embrace/shared';
import type { MemberDetails } from '@/types/domain';
import { ATTENDANCE_WINDOWS } from '@/lib/members/attendance';
import { stageLabel } from '@/lib/members/display';
import { useMemberAttendance } from '@/lib/queries/memberDetails';
import InlineError from '@/components/ui/InlineError';
import Skeleton from '@/components/ui/Skeleton';
import AttendanceSummary from './AttendanceSummary';
import { SectionHeader } from './Field';

const selectClass =
  'px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500';

/**
 * The staff "Attendance" tab: the services a member attended in a chosen window, counted against
 * the services of the chosen types (Sunday services by default, as the attendance score counts).
 */
export default function Attendance({ member }: { member: MemberDetails }) {
  const [months, setMonths] = useState<number>(DEFAULT_ATTENDANCE_MONTHS);
  const [types, setTypes] = useState<ServiceType[]>([...DEFAULT_SCORING_SERVICE_TYPES]);
  const { data, isPending, isPlaceholderData, error, refetch } = useMemberAttendance(member.id, {
    months,
    types,
  });

  // At least one type stays checked: the API needs one, and an empty list would count nothing.
  // The last checked box stays focusable (aria-disabled) and the hint below says why.
  const toggleType = (type: ServiceType) =>
    setTypes((current) =>
      current.includes(type)
        ? current.length > 1
          ? current.filter((t) => t !== type)
          : current
        : SERVICE_TYPES.filter((t) => t === type || current.includes(t)),
    );

  return (
    <div className="space-y-6">
      <SectionHeader title="Attendance" />
      <div className="flex flex-wrap items-start gap-6">
        <div>
          <label htmlFor="attendance-months" className="block text-sm font-medium text-gray-700">
            Period
          </label>
          <select
            id="attendance-months"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className={selectClass}
          >
            {ATTENDANCE_WINDOWS.map((m) => (
              <option key={m} value={m}>
                Last {m} months
              </option>
            ))}
          </select>
        </div>
        <fieldset aria-describedby="attendance-types-hint">
          <legend className="text-sm font-medium text-gray-700">Service types counted</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
            {SERVICE_TYPES.map((type) => {
              const checked = types.includes(type);
              const locked = checked && types.length === 1;
              return (
                <label key={type} className="flex items-center text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-disabled={locked || undefined}
                    aria-describedby={locked ? 'attendance-types-hint' : undefined}
                    onChange={() => toggleType(type)}
                    className="rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500 aria-disabled:opacity-50"
                  />
                  <span className="ml-2">{stageLabel(type)}</span>
                </label>
              );
            })}
          </div>
          <p id="attendance-types-hint" className="mt-1 text-xs text-gray-500">
            At least one type is counted, so the last checked type cannot be cleared.
          </p>
        </fieldset>
      </div>
      {isPending ? (
        <Skeleton rows={3} label="Loading attendance" />
      ) : error || !data ? (
        <InlineError
          error={error}
          fallback="Could not load the attendance"
          onRetry={() => void refetch()}
        />
      ) : (
        <section aria-label="Attendance summary" aria-busy={isPlaceholderData}>
          {/* Always mounted, so the busy text is announced when it appears. */}
          <p role="status" className="text-sm text-gray-500">
            {isPlaceholderData ? 'Updating attendance…' : ''}
          </p>
          <AttendanceSummary summary={data} subject={member.name} />
        </section>
      )}
    </div>
  );
}
