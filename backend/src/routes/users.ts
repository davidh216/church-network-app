import express from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { isAdmin, isStaff, requireRole, STAFF } from '../middleware/auth';
import { parseOr400, cuidParam } from '../lib/validation';
import savedSearchRoutes from './saved-searches';

const router = express.Router();

// What every authenticated member may see about other members.
const directorySelect = {
  id: true,
  name: true,
  avatar: true,
  isActive: true,
  createdAt: true,
  roles: { include: { role: true } },
} satisfies Prisma.UserSelect;

// What admins and leaders see (and what the member list is built around).
const staffSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  avatar: true,
  bio: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  membershipDate: true,
  lastLoginAt: true,
  roles: { include: { role: true } },
  engagement: {
    select: {
      engagementScore: true,
      membershipStage: true,
      riskLevel: true,
      lastActivity: true,
      attendanceScore: true,
      givingScore: true,
      volunteerScore: true,
      communityScore: true,
      communicationScore: true,
    },
  },
} satisfies Prisma.UserSelect;

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

router.get('/export', requireRole(...STAFF), async (req, res) => {
  const query = parseOr400(exportQuerySchema, req.query, res);
  if (!query) return;

  const users = await prisma.user.findMany({
    where: query.members?.length ? { id: { in: query.members } } : { isActive: true },
    include: { roles: { include: { role: true } }, engagement: true },
    orderBy: { name: 'asc' },
  });

  const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');
  const rows = users.map((u) => ({
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
  }));

  if (query.format === 'json') {
    res.json({ success: true, data: rows });
    return;
  }

  const headers = Object.keys(rows[0] ?? { Name: '' });
  const csv = [headers.map(csvCell).join(','), ...rows.map((row) => headers.map((h) => csvCell(row[h as keyof typeof row])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="members.csv"');
  res.send(csv);
});

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  phone: z.string().trim().max(50).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  roleIds: z.array(z.string().min(1).max(64)).max(10).optional(),
});

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
  if (!requesterIsAdmin && roles.some((r) => r.name === 'admin')) {
    res.status(403).json({ error: 'Only an admin can grant the admin role' });
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
  const params = parseOr400(cuidParam, req.params, res);
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
  phone: z.string().trim().max(50).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  roleIds: z.array(z.string().min(1).max(64)).max(10).optional(),
});

// Members edit their own name/phone/bio. Staff may also activate/deactivate.
// Only admins change roles.
router.put('/:id', async (req, res) => {
  const params = parseOr400(cuidParam, req.params, res);
  if (!params) return;
  const body = parseOr400(updateUserSchema, req.body, res);
  if (!body) return;
  const requester = req.user!;
  const staff = isStaff(requester);
  const admin = isAdmin(requester);

  if (!staff && requester.id !== params.id) {
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

  const existing = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  let roleIds: string[] | undefined;
  if (body.roleIds !== undefined) {
    roleIds = await resolveRoleIds(body.roleIds, admin, res);
    if (!roleIds) return;
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
