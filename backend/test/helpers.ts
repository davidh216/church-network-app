import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { createApp } from '../src/app';
import type { RoleName } from '../src/types/auth';

export const app = createApp();

export async function resetDatabase() {
  await prisma.memberNote.deleteMany();
  await prisma.memberInteraction.deleteMany();
  await prisma.memberMilestone.deleteMany();
  await prisma.memberActivity.deleteMany();
  await prisma.memberEngagement.deleteMany();
  await prisma.savedSearch.deleteMany();
  await prisma.media.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  for (const name of ['admin', 'leader', 'member'] as RoleName[]) {
    await prisma.role.create({ data: { name, permissions: '[]' } });
  }
}

export async function createUser(opts: {
  email: string;
  role: RoleName;
  password?: string;
  isActive?: boolean;
  name?: string;
}) {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: opts.role } });
  return prisma.user.create({
    data: {
      email: opts.email,
      name: opts.name ?? opts.email.split('@')[0]!,
      password: await bcrypt.hash(opts.password ?? 'correct-horse-battery', 4),
      isActive: opts.isActive ?? true,
      roles: { create: [{ roleId: role.id }] },
    },
  });
}

// createUser inserts rows directly, like accounts created before every account got an
// engagement row. This runs the data migration that backfilled those rows, returning the
// number of rows it inserted.
export const ENGAGEMENT_BACKFILL_SQL = readFileSync(
  resolve(
    __dirname,
    '../prisma/migrations/20261005000000_engagement_rows_for_all_users/migration.sql',
  ),
  'utf8',
);
export function backfillEngagementRows(): Promise<number> {
  return prisma.$executeRawUnsafe(ENGAGEMENT_BACKFILL_SQL);
}

// The JWT from the session cookie of a successful login (the body carries no token). Tests send
// it back as a bearer token; test/auth.test.ts covers the cookie itself.
export function sessionToken(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const session = cookies.find((c) => c.startsWith('embrace_session='));
  return session?.slice('embrace_session='.length).split(';')[0];
}

export async function login(email: string, password = 'correct-horse-battery'): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  const token = sessionToken(res);
  if (res.status !== 200 || !token)
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return token;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
