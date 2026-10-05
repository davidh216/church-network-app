/** Helpers for the `/services` page: month navigation, service names and the attendance save. */
import type { MarkAttendanceInput, Service, ServiceAttendanceMember } from '@embrace/shared';
import { formatCalendarDate, localIsoDay } from '@/lib/format/date';
import { stageLabel } from '@/lib/members/display';

const MONTH = /^(\d{4})-(\d{2})$/;

/** The viewer's current month as `YYYY-MM`. */
export function currentMonth(now: Date = new Date()): string {
  return localIsoDay(now).slice(0, 7);
}

function parseMonth(month: string): { year: number; index: number } {
  const match = MONTH.exec(month);
  if (!match) throw new Error(`Not a month: ${month}`);
  return { year: Number(match[1]), index: Number(match[2]) - 1 };
}

/** The month `delta` months after `month` ("2026-01", -1 -> "2025-12"). */
export function shiftMonth(month: string, delta: number): string {
  const { year, index } = parseMonth(month);
  return currentMonth(new Date(year, index + delta, 1));
}

/** The first and last day of a `YYYY-MM` month, as `YYYY-MM-DD` (both inclusive). */
export function monthBounds(month: string): { from: string; to: string } {
  const { year, index } = parseMonth(month);
  return {
    from: localIsoDay(new Date(year, index, 1)),
    to: localIsoDay(new Date(year, index + 1, 0)),
  };
}

/** "October 2026" in the viewer's locale. */
export function monthTitle(month: string): string {
  const { year, index } = parseMonth(month);
  return new Date(year, index, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** The day a new service defaults to: today in the current month, else the month's first day. */
export function defaultServiceDate(month: string, now: Date = new Date()): string {
  return month === currentMonth(now) ? localIsoDay(now) : monthBounds(month).from;
}

/** "Harvest Sunday (Sunday Service)" or "Sunday Service": what the service is called. */
export function serviceTitle(service: Pick<Service, 'title' | 'type'>): string {
  const type = stageLabel(service.type);
  return service.title ? `${service.title} (${type})` : type;
}

/** "Sunday Service on 10/4/2026": a name that tells rows of the same month apart. */
export function serviceName(service: Pick<Service, 'title' | 'type' | 'date'>): string {
  return `${serviceTitle(service)} on ${formatCalendarDate(service.date) ?? service.date}`;
}

/**
 * The body of the attendance save: every member checked is present, and a member unchecked is
 * absent only when something was recorded for them before, so saving an untouched sheet adds no
 * absence rows for members nobody marked.
 */
export function attendanceBody(
  members: readonly ServiceAttendanceMember[],
  present: ReadonlySet<string>,
): Required<MarkAttendanceInput> {
  const body: Required<MarkAttendanceInput> = { present: [], absent: [] };
  for (const { user, recorded } of members) {
    if (present.has(user.id)) body.present.push(user.id);
    else if (recorded) body.absent.push(user.id);
  }
  return body;
}

/** The members recorded present, as a set of ids (the sheet's starting state). */
export function presentIds(members: readonly ServiceAttendanceMember[]): Set<string> {
  return new Set(members.filter((m) => m.present).map((m) => m.user.id));
}
