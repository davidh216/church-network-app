import bcrypt from 'bcryptjs';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../lib/http-error';
import { signToken } from '../../middleware/auth';
import { selfSelect } from '../users/selects';
import type { loginBody, registerBody } from './schemas';

// Self-registration creates an INACTIVE account with the member role. An admin or leader activates it.
export async function register(body: z.output<typeof registerBody>) {
  const email = body.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new HttpError(400, 'Registration could not be completed');

  const hashed = await bcrypt.hash(body.password, 10);
  const memberRole = await prisma.role.findUnique({ where: { name: 'member' } });

  return prisma.user.create({
    data: {
      email,
      password: hashed,
      name: body.name,
      phone: body.phone ?? null,
      isActive: false,
      roles: memberRole ? { create: [{ roleId: memberRole.id }] } : undefined,
    },
    select: { id: true, email: true, name: true, isActive: true, createdAt: true },
  });
}

// Returns the signed-in user's self projection and a session token.
export async function login(body: z.output<typeof loginBody>) {
  // The password hash is omitted globally; select it back in for the comparison only.
  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
    select: { ...selfSelect, password: true },
  });

  if (!user || !(await bcrypt.compare(body.password, user.password))) {
    throw new HttpError(401, 'Invalid credentials');
  }
  if (!user.isActive) {
    throw new HttpError(401, 'Account is awaiting approval or has been deactivated');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const { password: _password, ...safeUser } = user;
  return { user: safeUser, token: signToken(user.id) };
}
