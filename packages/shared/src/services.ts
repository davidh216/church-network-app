import { z } from 'zod';
import { SERVICE_TYPES, serviceType, type ServiceType } from './enums.js';
import {
  cuid,
  DATE_MESSAGE,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  optionalText,
  type WithNumericPaging,
} from './primitives.js';

// Services and attendance (PHASE3_SPECS.md 1.4). A service is held once per date and type;
// attendance rows name a service and a member.

// A calendar date as `YYYY-MM-DD` (services are dated by day, with no time or time zone).
export const serviceDate = z.iso.date({ error: DATE_MESSAGE });

// POST /api/services (staff)
export const createServiceInput = z.object({
  date: serviceDate,
  type: serviceType.default('sunday_service'),
  title: optionalText('Title', 200),
  notes: optionalText('Notes', 2000),
});

// PUT /api/services/:id (staff): any subset of the fields; a blank title or notes clears it.
export const updateServiceInput = z.object({
  date: serviceDate.optional(),
  type: serviceType.optional(),
  title: optionalText('Title', 200),
  notes: optionalText('Notes', 2000),
});

export const DEFAULT_SERVICE_PAGE_SIZE = 50;

const DATE_RANGE_MESSAGE = 'The start date must not be after the end date';

// Query string of GET /api/services (staff): inclusive date range, optional type, paging.
export const listServicesQuery = z
  .object({
    from: serviceDate.optional(),
    to: serviceDate.optional(),
    type: serviceType.optional(),
    page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_SERVICE_PAGE_SIZE),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { error: DATE_RANGE_MESSAGE, path: ['to'] });

// The most member ids one attendance save may name (both lists together).
export const MAX_ATTENDANCE_BATCH = 2000;
const memberIds = z.array(cuid, { error: 'Must be a list of member ids' }).default([]);

// PUT /api/services/:id/attendance (staff): members marked present and absent. Members in
// neither list keep whatever was recorded before, so saving the same body twice is a no-op.
export const markAttendanceInput = z
  .object({ present: memberIds, absent: memberIds })
  .refine((b) => b.present.length + b.absent.length <= MAX_ATTENDANCE_BATCH, {
    error: `Mark at most ${MAX_ATTENDANCE_BATCH} members at a time`,
    path: ['present'],
  })
  .refine((b) => !b.present.some((id) => b.absent.includes(id)), {
    error: 'A member cannot be both present and absent',
    path: ['absent'],
  });

// The service types attendance scores count by default (PHASE3_SPECS.md 1.4).
export const DEFAULT_SCORING_SERVICE_TYPES: readonly ServiceType[] = ['sunday_service'];
export const DEFAULT_ATTENDANCE_MONTHS = 12;
export const MAX_ATTENDANCE_MONTHS = 60;

// `types` arrives as `types=a,b` or as a repeated parameter; either way a list of service types,
// returned in enum order.
export const scoringTypes = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      : value,
  z
    .array(serviceType)
    .min(1, 'Choose at least one service type')
    .transform((types) => SERVICE_TYPES.filter((t) => types.includes(t))),
);

// Query string of GET /api/member-details/:id/attendance and /me/attendance.
export const memberAttendanceQuery = z.object({
  months: z.coerce
    .number({ error: 'Months must be a whole number' })
    .int('Months must be a whole number')
    .min(1, 'Months must be at least 1')
    .max(MAX_ATTENDANCE_MONTHS, `Months must be at most ${MAX_ATTENDANCE_MONTHS}`)
    .default(DEFAULT_ATTENDANCE_MONTHS),
  types: scoringTypes.optional().transform((types) => types ?? [...DEFAULT_SCORING_SERVICE_TYPES]),
});

export type CreateServiceInput = z.input<typeof createServiceInput>;
export type UpdateServiceInput = z.input<typeof updateServiceInput>;
export type MarkAttendanceInput = z.input<typeof markAttendanceInput>;
export type ListServicesQuery = z.input<typeof listServicesQuery>;
export type ListServicesParams = WithNumericPaging<ListServicesQuery>;
export interface MemberAttendanceParams {
  months?: number;
  types?: ServiceType[];
}

// Response shapes. Dates of services are `YYYY-MM-DD`; timestamps are ISO strings.
export interface Service {
  id: string;
  date: string;
  type: ServiceType;
  title: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
  /** Members recorded present. */
  presentCount: number;
}

export interface ServiceAttendanceMember {
  /** The email tells members with the same name apart (the sheet is staff only). */
  user: { id: string; name: string; email: string; avatar: string | null };
  present: boolean;
  /** False when nothing was recorded for this member yet (shown as not present). */
  recorded: boolean;
}

export interface ServiceAttendance {
  service: Service;
  members: ServiceAttendanceMember[];
}

export interface AttendedService {
  id: string;
  date: string;
  type: ServiceType;
  title: string | null;
}

export interface MemberAttendanceSummary {
  /** The window: the last `months` months up to today, inclusive. */
  months: number;
  from: string;
  to: string;
  /** The service types counted. */
  types: ServiceType[];
  /** Services of those types held in the window. */
  serviceCount: number;
  /** Of those, the services the member was recorded present at. */
  attendedCount: number;
  /** The attended services, newest first. */
  attended: AttendedService[];
}
