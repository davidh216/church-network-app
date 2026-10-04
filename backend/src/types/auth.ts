import type { Prisma } from '@prisma/client';

export type RoleName = 'admin' | 'leader' | 'member';

export type AuthenticatedUser = Omit<
  Prisma.UserGetPayload<{ include: { roles: { include: { role: true } } } }>,
  'password'
>;
