/** Helpers for the `/services` page: month navigation, service names and the attendance save. */
import type {
  CreateServiceInput,
  MarkAttendanceInput,
  Service,
  ServiceAttendanceMember,
  UpdateServiceInput,
} from '@embrace/shared';
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
 * The edit body: only the fields the form changed, so a save does not write back a value someone
 * else changed meanwhile. A cleared title or notes is sent as null, which clears it.
 */
export function changedServiceFields(
  service: Pick<Service, 'date' | 'type' | 'title' | 'notes'>,
  values: CreateServiceInput,
): UpdateServiceInput {
  const input: UpdateServiceInput = {};
  if (values.date !== service.date) input.date = values.date;
  if (values.type !== undefined && values.type !== service.type) input.type = values.type;
  const title = values.title ?? null;
  if (title !== service.title) input.title = title;
  const notes = values.notes ?? null;
  if (notes !== service.notes) input.notes = notes;
  return input;
}

/** The user's own unsaved marks on an attendance sheet: member id -> present. */
export type AttendanceDraft = ReadonlyMap<string, boolean>;

/** What a member's checkbox shows: the user's own mark, else what the server recorded. */
export function isMarkedPresent(member: ServiceAttendanceMember, draft: AttendanceDraft): boolean {
  return draft.get(member.user.id) ?? member.present;
}

/** The draft with `ids` marked present (`value` true) or not. */
export function markDraft(draft: AttendanceDraft, ids: readonly string[], value: boolean) {
  const next = new Map(draft);
  for (const id of ids) next.set(id, value);
  return next;
}

/**
 * The body of the attendance save: only the user's marks that differ from the sheet the server
 * sent last (present = ticked, absent = unticked). Members nobody touched are never sent, so a
 * mark another staff member saved meanwhile is kept, and an untouched member never gains an
 * absence row.
 */
export function attendanceBody(
  members: readonly ServiceAttendanceMember[],
  draft: AttendanceDraft,
): Required<MarkAttendanceInput> {
  const body: Required<MarkAttendanceInput> = { present: [], absent: [] };
  for (const { user, present } of members) {
    const mark = draft.get(user.id);
    if (mark === undefined || mark === present) continue;
    (mark ? body.present : body.absent).push(user.id);
  }
  return body;
}

/** True when the draft holds a mark the server does not have yet. */
export function hasUnsavedMarks(
  members: readonly ServiceAttendanceMember[],
  draft: AttendanceDraft,
): boolean {
  const body = attendanceBody(members, draft);
  return body.present.length + body.absent.length > 0;
}

/**
 * The draft after a save that started from `submitted`: marks still as they were submitted are
 * dropped (the refetched sheet now shows them), marks changed while the save was in flight stay.
 */
export function withoutSaved(draft: AttendanceDraft, submitted: AttendanceDraft) {
  const next = new Map(draft);
  for (const [id, value] of submitted) if (next.get(id) === value) next.delete(id);
  return next;
}

/** Lower-cased names held by more than one member of the sheet. */
export function sharedNames(members: readonly ServiceAttendanceMember[]): Set<string> {
  const seen = new Set<string>();
  const shared = new Set<string>();
  for (const { user } of members) {
    const key = user.name.trim().toLowerCase();
    if (seen.has(key)) shared.add(key);
    seen.add(key);
  }
  return shared;
}
