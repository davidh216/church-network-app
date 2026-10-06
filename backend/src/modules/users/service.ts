import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type {
  createUserInput,
  listUsersQuery,
  searchQuery,
  updateUserInput,
} from '@embrace/shared';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../lib/http-error';
import { assertPasswordNotEmail } from '../../lib/password-policy';
import { isAdmin, STAFF } from '../../middleware/auth';
import type { AuthenticatedUser } from '../../types/auth';
import { listWhere, orderBy, paging, searchWhere } from './search';
import { directorySelect, staffSelect } from './selects';

const STAFF_ROLE_NAMES: readonly string[] = STAFF;

// One page of users matching `where`, with the total count of matches.
async function findPage<S extends Prisma.UserSelect>(
  where: Prisma.UserWhereInput,
  select: S,
  sortBy: Prisma.UserOrderByWithRelationInput[],
  page: number | undefined,
  pageSize: number | undefined,
) {
  const p = paging(page, pageSize);
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({ where, select, orderBy: sortBy, skip: p.skip, take: p.take }),
    prisma.user.count({ where }),
  ]);
  return { users, total, page: p.page, pageSize: p.pageSize };
}

// Staff see every account with contact and engagement fields; members see the active directory.
// The router has already refused the staff-only filters for members; listWhere ignores them too.
export function listUsers(staff: boolean, query: z.output<typeof listUsersQuery>) {
  return findPage(
    listWhere(query, staff),
    staff ? staffSelect : directorySelect,
    orderBy(query.sort, query.order),
    query.page,
    query.pageSize,
  );
}

// The advanced member search (staff only).
export function searchUsers(query: z.output<typeof searchQuery>) {
  return findPage(
    searchWhere(query),
    staffSelect,
    orderBy(query.sort, query.order),
    query.page,
    query.pageSize,
  );
}

// Dashboard counts. Members get only `total`, the size of the directory they can see (active
// accounts), so nothing about inactive accounts is revealed. Staff get the total of all accounts,
// the active ones, accounts awaiting approval (inactive and never signed in: a registration, or a
// staff-created inactive account) and accounts created since the start of the current UTC month.
type MemberSummary = { total: number };
type StaffSummary = {
  total: number;
  active: number;
  pendingApproval: number;
  newThisMonth: number;
};

export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function summary(staff: false, now?: Date): Promise<MemberSummary>;
export async function summary(staff: true, now?: Date): Promise<StaffSummary>;
export async function summary(staff: boolean, now?: Date): Promise<MemberSummary | StaffSummary>;
export async function summary(
  staff: boolean,
  now: Date = new Date(),
): Promise<MemberSummary | StaffSummary> {
  if (!staff) return { total: await prisma.user.count({ where: { isActive: true } }) };
  const [total, active, pendingApproval, newThisMonth] = await prisma.$transaction([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: false, lastLoginAt: null } }),
    prisma.user.count({ where: { createdAt: { gte: startOfUtcMonth(now) } } }),
  ]);
  return { total, active, pendingApproval, newThisMonth };
}

// Column order of the export. The CSV header always lists every column, even when no rows match.
export const EXPORT_COLUMNS = [
  'Name',
  'Email',
  'Phone',
  'Bio',
  'Status',
  'Roles',
  'Engagement Score',
  'Membership Stage',
  'Risk Level',
  'Attendance Score',
  'Community Score',
  'Communication Score',
  'Join Date',
  'Membership Date',
  'Last Activity',
  'Last Login',
] as const;

export type ExportRow = Record<(typeof EXPORT_COLUMNS)[number], string | number>;

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

// The selected members (or every active member) as flat export rows.
export async function exportRows(memberIds: string[] | undefined): Promise<ExportRow[]> {
  const users = await prisma.user.findMany({
    where: memberIds?.length ? { id: { in: memberIds } } : { isActive: true },
    include: { roles: { include: { role: true } }, engagement: true },
    orderBy: { name: 'asc' },
  });
  return users.map((u) => ({
    Name: u.name,
    Email: u.email,
    Phone: u.phone ?? '',
    Bio: u.bio ?? '',
    Status: u.isActive ? 'Active' : 'Inactive',
    Roles: u.roles.map((r) => r.role.name).join(', '),
    'Engagement Score': u.engagement?.engagementScore ?? 0,
    'Membership Stage': u.engagement?.membershipStage ?? 'Unknown',
    'Risk Level': u.engagement?.riskLevel ?? 'Unknown',
    'Attendance Score': u.engagement?.attendanceScore ?? 0,
    'Community Score': u.engagement?.communityScore ?? 0,
    'Communication Score': u.engagement?.communicationScore ?? 0,
    'Join Date': day(u.createdAt),
    'Membership Date': day(u.membershipDate),
    'Last Activity': day(u.engagement?.lastActivity),
    'Last Login': day(u.lastLoginAt),
  }));
}

function csvCell(value: string | number): string {
  let text = String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: ExportRow[]): string {
  const lines = [EXPORT_COLUMNS, ...rows.map((row) => EXPORT_COLUMNS.map((column) => row[column]))];
  return lines.map((cells) => cells.map(csvCell).join(',')).join('\n');
}

// Resolves requested role ids (defaulting to `member`). Staff may create members,
// but only an admin may grant any role other than `member`.
async function resolveRoleIds(
  roleIds: string[] | undefined,
  requesterIsAdmin: boolean,
): Promise<string[]> {
  if (!roleIds || roleIds.length === 0) {
    const member = await prisma.role.findUnique({ where: { name: 'member' } });
    return member ? [member.id] : [];
  }
  const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } });
  if (roles.length !== new Set(roleIds).size) throw new HttpError(400, 'Unknown role id');
  if (!requesterIsAdmin && roles.some((r) => r.name !== 'member')) {
    throw new HttpError(403, 'Only an admin can grant staff roles');
  }
  return roles.map((r) => r.id);
}

// Staff create members directly (active by default, roles assigned).
export async function createUser(
  requester: AuthenticatedUser,
  body: z.output<typeof createUserInput>,
) {
  const email = body.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new HttpError(409, 'A user with this email already exists');
  }
  const roleIds = await resolveRoleIds(body.roleIds, isAdmin(requester));
  return prisma.user.create({
    data: {
      name: body.name,
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      email,
      password: await bcrypt.hash(body.password, 10),
      phone: body.phone ?? null,
      bio: body.bio ?? null,
      volunteerSkills: body.volunteerSkills ?? [],
      interests: body.interests ?? [],
      isActive: body.isActive ?? true,
      roles: { create: roleIds.map((roleId) => ({ roleId })) },
      // Every account has an engagement row (defaults: score 0, visitor, low risk).
      engagement: { create: {} },
    },
    select: staffSelect,
  });
}

// `full` (staff or the user themself) returns the staff projection; others get the
// directory projection, and inactive accounts are hidden from them.
export async function getUser(id: string, full: boolean) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: full ? staffSelect : directorySelect,
  });
  if (!user || (!full && !user.isActive)) throw new HttpError(404, 'User not found');
  return user;
}

function adminRoleId(user: AuthenticatedUser): string | undefined {
  return user.roles.find((ur) => ur.role.name === 'admin')?.role.id;
}

// The rules that depend on the target account: only admins modify other staff accounts,
// and an admin cannot deactivate themself or drop their own admin role. The router has
// already checked who may edit whom and which fields.
export async function updateUser(
  requester: AuthenticatedUser,
  id: string,
  body: z.output<typeof updateUserInput>,
) {
  const admin = isAdmin(requester);
  const self = requester.id === id;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, roles: { select: { role: { select: { name: true } } } } },
  });
  if (!target) throw new HttpError(404, 'User not found');
  if (!admin && !self && target.roles.some((ur) => STAFF_ROLE_NAMES.includes(ur.role.name))) {
    throw new HttpError(403, 'Only an admin can modify staff accounts');
  }
  if (admin && self && body.isActive === false)
    throw new HttpError(403, 'You cannot lock yourself out');

  let roleIds: string[] | undefined;
  if (body.roleIds !== undefined) {
    roleIds = await resolveRoleIds(body.roleIds, admin);
    const ownAdminRoleId = adminRoleId(requester);
    if (admin && self && (!ownAdminRoleId || !roleIds.includes(ownAdminRoleId))) {
      throw new HttpError(403, 'You cannot lock yourself out');
    }
  }

  return prisma.user.update({
    where: { id },
    data: {
      name: body.name,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      bio: body.bio,
      volunteerSkills: body.volunteerSkills,
      interests: body.interests,
      isActive: body.isActive,
      roles: roleIds
        ? { deleteMany: {}, create: roleIds.map((roleId) => ({ roleId })) }
        : undefined,
    },
    select: staffSelect,
  });
}

export async function resetPassword(id: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!user) throw new HttpError(404, 'User not found');
  assertPasswordNotEmail(newPassword, user.email, 'newPassword');
  await prisma.user.update({
    where: { id },
    data: { password: await bcrypt.hash(newPassword, 10) },
  });
}
