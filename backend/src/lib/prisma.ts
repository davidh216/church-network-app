// First, on purpose: constructing a PrismaClient loads the .env beside the schema into
// process.env, and the configuration must be parsed before that (test runs never read .env).
import '../config/env';
import { PrismaClient } from '@prisma/client';

// One client for the whole process. Password hashes are omitted from every
// User read unless a query explicitly opts back in (login does).
function createClient() {
  return new PrismaClient({
    omit: { user: { password: true } },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
