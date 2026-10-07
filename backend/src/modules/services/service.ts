import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type {
  createServiceInput,
  listServicesQuery,
  markAttendanceInput,
  MemberAttendanceSummary,
  memberAttendanceQuery,
  Service,
  ServiceAttendance,
  updateServiceInput,
} from '@embrace/shared';
import { prisma } from '../../lib/prisma';
import { fieldError, HttpError } from '../../lib/http-error';

// Services and attendance (PHASE3_SPECS.md 1.4). Service dates are calendar days stored as
// `date`; the API takes and returns them as `YYYY-MM-DD` (UTC midnight inside the app).

const DUPLICATE_SERVICE = 'A service of this type already exists on that date';

/** `YYYY-MM-DD` -> the Date Prisma stores in a `date` column (UTC midnight). */
export function toDbDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** A `date` column value -> `YYYY-MM-DD`. */
export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today (UTC) as a `date` column value. */
export function today(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** `day` minus `months` calendar months, clamped to the last day of the target month. */
export function monthsBefore(day: Date, months: number): Date {
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day.getUTCDate(), lastDay)));
}

const serviceSelect = {
  id: true,
  date: true,
  type: true,
  title: true,
  notes: true,
  createdById: true,
  createdAt: true,
  _count: { select: { attendance: { where: { present: true } } } },
} satisfies Prisma.ServiceSelect;

type ServiceRow = Prisma.ServiceGetPayload<{ select: typeof serviceSelect }>;

function toService({ _count, date, createdAt, ...row }: ServiceRow): Service {
  return {
    ...row,
    date: toDay(date),
    createdAt: createdAt.toISOString(),
    presentCount: _count.attendance,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

// Newest first; services on the same day by type.
export async function listServices(query: z.output<typeof listServicesQuery>) {
  const where: Prisma.ServiceWhereInput = {
    type: query.type,
    date: {
      gte: query.from ? toDbDate(query.from) : undefined,
      lte: query.to ? toDbDate(query.to) : undefined,
    },
  };
  const { page, pageSize } = query;
  const [rows, total] = await prisma.$transaction([
    prisma.service.findMany({
      where,
      orderBy: [{ date: 'desc' }, { type: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: serviceSelect,
    }),
    prisma.service.count({ where }),
  ]);
  return { services: rows.map(toService), total, page, pageSize };
}

export async function getService(id: string): Promise<Service> {
  const row = await prisma.service.findUnique({ where: { id }, select: serviceSelect });
  if (!row) throw new HttpError(404, 'Service not found');
  return toService(row);
}

export async function createService(
  createdById: string,
  body: z.output<typeof createServiceInput>,
): Promise<Service> {
  try {
    const row = await prisma.service.create({
      data: { ...body, date: toDbDate(body.date), createdById },
      select: serviceSelect,
    });
    return toService(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, DUPLICATE_SERVICE, 'CONFLICT');
    throw err;
  }
}

export async function updateService(
  id: string,
  body: z.output<typeof updateServiceInput>,
): Promise<Service> {
  try {
    const row = await prisma.service.update({
      where: { id },
      data: { ...body, date: body.date ? toDbDate(body.date) : undefined },
      select: serviceSelect,
    });
    return toService(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, DUPLICATE_SERVICE, 'CONFLICT');
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')
      throw new HttpError(404, 'Service not found');
    throw err;
  }
}

// Deleting a service deletes its attendance rows (cascade).
export async function deleteService(id: string): Promise<void> {
  const { count } = await prisma.service.deleteMany({ where: { id } });
  if (count === 0) throw new HttpError(404, 'Service not found');
}

// The attendance sheet: every active member, plus anyone already recorded for this service (so a
// row is never hidden after an account is deactivated), by name. The email (staff only, like this
// route) tells members with the same name apart.
export async function getServiceAttendance(id: string): Promise<ServiceAttendance> {
  const service = await getService(id);
  const [users, rows] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ isActive: true }, { attendances: { some: { serviceId: id } } }] },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, email: true, avatar: true },
    }),
    prisma.attendance.findMany({
      where: { serviceId: id },
      select: { userId: true, present: true },
    }),
  ]);
  const recorded = new Map(rows.map((row) => [row.userId, row.present]));
  return {
    service,
    members: users.map((user) => ({
      user,
      present: recorded.get(user.id) ?? false,
      recorded: recorded.has(user.id),
    })),
  };
}

// Records the members marked present and absent (an upsert per member, in one transaction).
// Members named in neither list keep what was recorded before; the same body twice leaves the
// same rows. An id that names no member is a 400 VALIDATION and nothing is written.
export async function markAttendance(
  serviceId: string,
  recordedById: string,
  body: z.output<typeof markAttendanceInput>,
): Promise<{ present: number; absent: number }> {
  await getService(serviceId);
  const present = [...new Set(body.present)];
  const absent = [...new Set(body.absent)];
  const ids = [...present, ...absent];

  if (ids.length > 0) {
    const known = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (known.length !== ids.length) {
      const found = new Set(known.map((u) => u.id));
      const field = present.some((id) => !found.has(id)) ? 'present' : 'absent';
      throw fieldError(field, 'Every id must name an existing member');
    }
  }

  const mark = (userIds: string[], isPresent: boolean) => [
    prisma.attendance.createMany({
      data: userIds.map((userId) => ({ userId, serviceId, present: isPresent, recordedById })),
      skipDuplicates: true,
    }),
    prisma.attendance.updateMany({
      where: { serviceId, userId: { in: userIds }, present: !isPresent },
      data: { present: isPresent, recordedById },
    }),
  ];
  await prisma.$transaction([...mark(present, true), ...mark(absent, false)]);

  const [presentCount, absentCount] = await Promise.all([
    prisma.attendance.count({ where: { serviceId, present: true } }),
    prisma.attendance.count({ where: { serviceId, present: false } }),
  ]);
  return { present: presentCount, absent: absentCount };
}

// A member's attendance over the last `months` months: the services of the scoring types held in
// that window and the ones the member was recorded present at.
export async function memberAttendanceSummary(
  userId: string,
  query: z.output<typeof memberAttendanceQuery>,
  now = new Date(),
): Promise<MemberAttendanceSummary> {
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) throw new HttpError(404, 'User not found');

  const to = today(now);
  const from = monthsBefore(to, query.months);
  const inWindow: Prisma.ServiceWhereInput = {
    date: { gte: from, lte: to },
    type: { in: query.types },
  };
  const [serviceCount, attended] = await Promise.all([
    prisma.service.count({ where: inWindow }),
    prisma.attendance.findMany({
      where: { userId, present: true, service: inWindow },
      orderBy: [{ service: { date: 'desc' } }, { service: { type: 'asc' } }],
      select: { service: { select: { id: true, date: true, type: true, title: true } } },
    }),
  ]);

  return {
    months: query.months,
    from: toDay(from),
    to: toDay(to),
    types: query.types,
    serviceCount,
    attendedCount: attended.length,
    attended: attended.map(({ service }) => ({ ...service, date: toDay(service.date) })),
  };
}
