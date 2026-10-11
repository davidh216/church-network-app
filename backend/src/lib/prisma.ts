import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { pgConfigFromUrl } from './pg-config';

/**
 * The pg driver adapter for a Prisma connection URL, configured as Prisma 6 read that URL (SSL
 * modes, pool size and timeouts, `schema`; see pgConfigFromUrl). The schema goes to the adapter,
 * which names it in the queries Prisma generates, and into every connection's search_path.
 */
export function pgAdapter(connectionString: string) {
  const { config, schema } = pgConfigFromUrl(connectionString);
  return new PrismaPg(config, { schema });
}

// One client for the whole process. Password hashes are omitted from every
// User read unless a query explicitly opts back in (login does).
// Prisma 7 reads no .env file and takes no URL from the schema: the URL comes from the
// configuration parsed in config/env.ts, which has already rejected a URL pgConfigFromUrl cannot
// read. A query fails after the connection timeout (10 s by default) when no connection can be
// made, so /health answers 503 while the database is down, and idle connections close after 5
// minutes.
function createClient() {
  return new PrismaClient({
    adapter: pgAdapter(env.DATABASE_URL),
    omit: { user: { password: true } },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
