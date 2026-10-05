/** Helpers for the attendance summaries on the member profiles. */
import type { MemberAttendanceSummary } from '@embrace/shared';
import { stageLabel } from './display';

/** "Sunday Service", or "Sunday Service, Bible Study and Prayer Meeting" for several types. */
export function serviceTypesLabel(types: readonly string[]): string {
  const labels = types.map(stageLabel);
  if (labels.length <= 1) return labels[0] ?? 'all';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** Whole-number percentage of the services attended, or null when no service was held. */
export function attendanceRate(
  summary: Pick<MemberAttendanceSummary, 'attendedCount' | 'serviceCount'>,
): number | null {
  if (summary.serviceCount === 0) return null;
  return Math.round((100 * summary.attendedCount) / summary.serviceCount);
}

/** The window lengths, in months, staff can pick on the profile's Attendance tab. */
export const ATTENDANCE_WINDOWS = [3, 6, 12, 24] as const;
