import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { isAdmin, isStaff, requireRole, STAFF } from '../middleware/auth';
import { parseOr400, idParam } from '../lib/validation';
import { directorySelect, staffSelect } from '../lib/user-selects';
import type { AuthenticatedUser } from '../types/auth';
import savedSearchRoutes from './saved-searches';

// The signed-in user's own row. Defined in lib/user-selects (shared with the auth
// middleware without an import cycle) and re-exported here next to its siblings.
export { selfSelect } from '../lib/user-selects';

const router = express.Router();

const STAFF_ROLE_NAMES: readonly string[] = STAFF;

// Saved searches live under /api/users/saved-searches and must be mounted before /:id.
router.use('/saved-searches', savedSearchRoutes);

router.get('/', async (req, res) => {
  const user = req.user!;
  const staff = isStaff(user);
  const users = await prisma.user.findMany({
    where: staff ? undefined : { isActive: true },
    select: staff ? staffSelect : directorySelect,
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, users });
});

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const exportQuerySchema = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
  members: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined)),
});

// Column order of the export. The CSV header always lists every column, even when no rows match.
const EXPORT_COLUMNS = [
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
  'Giving Score',
  'Volunteer Score',
  'Community Score',
  'Communication Score',
  'Join Date',
  'Membership Date',
  'Last Activity',
  'Last Login',
] as const;

type ExportRow = Record<(typeof EXPORT_COLUMNS)[number], string | number>;

router.get('/export', requireRole(...STAFF), async (req, res) => {
  const query = parseOr400(exportQuerySchema, req.query, res);
  if (!query) return;

  const users = await prisma.user.findMany({
    where: query.members?.length ? { id: { in: query.members } } : { isActive: true },
    include: { roles: { include: { role: true } }, engagement: true },
    orderBy: { name: 'asc' },
  });

  const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');
  const rows = users.map(
    (u): ExportRow => ({
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
      'Giving Score': u.engagement?.givingScore ?? 0,
      'Volunteer Score': u.engagement?.volunteerScore ?? 0,
      'Community Score': u.engagement?.communityScore ?? 0,
      'Communication Score': u.engagement?.communicationScore ?? 0,
      'Join Date': day(u.createdAt),
      'Membership Date': day(u.membershipDate),
      'Last Activity': day(u.engagement?.lastActivity),
      'Last Login': day(u.lastLoginAt),
    }),
  );

  if (query.format === 'json') {
    res.json({ success: true, data: rows });
    return;
  }

  const lines = [EXPORT_COLUMNS, ...rows.map((row) => EXPORT_COLUMNS.map((column) => row[column]))];
  const csv = lines.map((cells) => cells.map(csvCell).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="members.csv"');
  res.send(csv);
});

// Optional free-text fields: trimmed, and a blank value is stored as null.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  phone: optionalText(50),
  bio: optionalText(2000),
  isActive: z.boolean().optional(),
  roleIds: z.array(z.string().min(1).max(64)).max(10).optional(),
});

// Resolves requested role ids (defaulting to `member`). Staff may create members,
// but only an admin may grant any role other than `member`.
async function resolveRoleIds(roleIds: string[] | undefined, requesterIsAdmin: boolean, res: express.Response) {
  if (!roleIds || roleIds.length === 0) {
    const member = await prisma.role.findUnique({ where: { name: 'member' } });
    return member ? [member.id] : [];
  }
  const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } });
  if (roles.length !== new Set(roleIds).size) {
    res.status(400).json({ error: 'Unknown role id' });
    return undefined;
  }
  if (!requesterIsAdmin && roles.some((r) => r.name !== 'member')) {
    res.status(403).json({ error: 'Only an admin can grant staff roles' });
    return undefined;
  }
  return roles.map((r) => r.id);
}

// Staff create members directly (active by default, roles assigned).
router.post('/', requireRole(...STAFF), async (req, res) => {
  const body = parseOr400(createUserSchema, req.body, res);
  if (!body) return;
  const requester = req.user!;

  const email = body.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    res.status(409).json({ error: 'A user with this email already exists' });
    return;
  }
  const roleIds = await resolveRoleIds(body.roleIds, isAdmin(requester), res);
  if (!roleIds) return;

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email,
      password: await bcrypt.hash(body.password, 10),
      phone: body.phone ?? null,
      bio: body.bio ?? null,
      isActive: body.isActive ?? true,
      roles: { create: roleIds.map((roleId) => ({ roleId })) },
    },
    select: staffSelect,
  });
  res.status(201).json({ success: true, user });
});

router.get('/:id', async (req, res) => {
  const params = parseOr400(idParam, req.params, res);
  if (!params) return;
  const requester = req.user!;
  const full = isStaff(requester) || requester.id === params.id;
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: full ? staffSelect : directorySelect,
  });
  if (!user || (!full && !user.isActive)) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ success: true, user });
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: optionalText(50),
  bio: optionalText(2000),
  isActive: z.boolean().optional(),
  roleIds: z.array(z.string().min(1).max(64)).max(10).optional(),
});

function adminRoleId(user: AuthenticatedUser): string | undefined {
  return user.roles.find((ur) => ur.role.name === 'admin')?.role.id;
}

// Members edit their own name/phone/bio. Staff may also activate/deactivate members.
// Only admins change roles or modify other staff accounts, and an admin cannot
// deactivate themself or drop their own admin role.
router.put('/:id', async (req, res) => {
  const params = parseOr400(idParam, req.params, res);
  if (!params) return;
  const body = parseOr400(updateUserSchema, req.body, res);
  if (!body) return;
  const requester = req.user!;
  const staff = isStaff(requester);
  const admin = isAdmin(requester);
  const self = requester.id === params.id;

  if (!staff && !self) {
    res.status(403).json({ error: 'Can only update your own profile' });
    return;
  }
  if (body.isActive !== undefined && !staff) {
    res.status(403).json({ error: 'Only staff can change account status' });
    return;
  }
  if (body.roleIds !== undefined && !admin) {
    res.status(403).json({ error: 'Only an admin can change roles' });
    return;
  }

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, roles: { select: { role: { select: { name: true } } } } },
  });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (!admin && !self && target.roles.some((ur) => STAFF_ROLE_NAMES.includes(ur.role.name))) {
    res.status(403).json({ error: 'Only an admin can modify staff accounts' });
    return;
  }
  if (admin && self && body.isActive === false) {
    res.status(403).json({ error: 'You cannot lock yourself out' });
    return;
  }

  let roleIds: string[] | undefined;
  if (body.roleIds !== undefined) {
    roleIds = await resolveRoleIds(body.roleIds, admin, res);
    if (!roleIds) return;
    const ownAdminRoleId = adminRoleId(requester);
    if (admin && self && (!ownAdminRoleId || !roleIds.includes(ownAdminRoleId))) {
      res.status(403).json({ error: 'You cannot lock yourself out' });
      return;
    }
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: {
      name: body.name,
      phone: body.phone,
      bio: body.bio,
      isActive: body.isActive,
      roles: roleIds ? { deleteMany: {}, create: roleIds.map((roleId) => ({ roleId })) } : undefined,
    },
    select: staffSelect,
  });
  res.json({ success: true, user });
});

export default router;
