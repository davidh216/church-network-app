import { prisma } from '../../lib/prisma';

export function listRoles() {
  return prisma.role.findMany({ orderBy: { name: 'asc' } });
}
