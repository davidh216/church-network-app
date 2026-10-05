import type { Prisma } from '@prisma/client';
import type { selfSelect } from '../modules/users/selects';

export type RoleName = 'admin' | 'leader' | 'member';

// The signed-in user as loaded by `authenticate`: the selfSelect projection
// (id, email, name, isActive, roles[].role, ...), never the password or staff notes.
export type AuthenticatedUser = Prisma.UserGetPayload<{ select: typeof selfSelect }>;
