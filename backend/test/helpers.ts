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

export async function createUser(opts: { email: string; role: RoleName; password?: string; isActive?: boolean; name?: string }) {
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

export async function login(email: string, password = 'correct-horse-battery'): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
