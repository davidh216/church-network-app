import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { changePasswordInput, loginInput, registerInput } from '@embrace/shared';
import { prisma } from '../../lib/prisma';
import { fieldError, HttpError } from '../../lib/http-error';
import { assertPasswordNotEmail } from '../../lib/password-policy';
import { signToken } from '../../middleware/auth';
import { selfSelect } from '../users/selects';

// Compared against when the email is unknown, so a login takes as long whether or not the
// account exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 10);

// Self-registration creates an INACTIVE account with the member role. An admin or leader activates it.
// An email that is already registered gets the same outcome as a new one and nothing is created,
// so the response does not reveal which emails have accounts.
export async function register(body: z.output<typeof registerInput>): Promise<void> {
  const email = body.email.toLowerCase();
  // Hash first so both paths cost the same bcrypt work.
  const hashed = await bcrypt.hash(body.password, 10);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return;

  const memberRole = await prisma.role.findUnique({ where: { name: 'member' } });
  try {
    await prisma.user.create({
      data: {
        email,
        password: hashed,
        name: body.name,
        phone: body.phone ?? null,
        isActive: false,
        roles: memberRole ? { create: [{ roleId: memberRole.id }] } : undefined,
        // Every account has an engagement row (defaults: score 0, visitor, low risk).
        engagement: { create: {} },
      },
    });
  } catch (err) {
    // A concurrent registration of the same email: treat it like any existing account.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }
}

// Returns the signed-in user's self projection and a session token.
export async function login(body: z.output<typeof loginInput>) {
  // The password hash is omitted globally; select it back in for the comparison only.
  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
    select: { ...selfSelect, password: true },
  });

  const passwordOk = await bcrypt.compare(body.password, user?.password ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    throw new HttpError(401, 'Invalid credentials');
  }
  if (!user.isActive) {
    throw new HttpError(401, 'Account is awaiting approval or has been deactivated');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const { password: _password, ...safeUser } = user;
  return { user: safeUser, token: signToken(user.id) };
}

// The signed-in user changes their own password. Sessions are stateless JWTs, so existing
// sessions stay valid until they expire.
export async function changePassword(
  userId: string,
  body: z.output<typeof changePasswordInput>,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, password: true },
  });
  if (!(await bcrypt.compare(body.currentPassword, user.password))) {
    throw fieldError('currentPassword', 'Current password is incorrect');
  }
  assertPasswordNotEmail(body.newPassword, user.email, 'newPassword');
  await prisma.user.update({
    where: { id: userId },
    data: { password: await bcrypt.hash(body.newPassword, 10) },
  });
}
