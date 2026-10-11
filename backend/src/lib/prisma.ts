import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

type PoolOptions = { connectionTimeoutMillis?: number; idleTimeoutMillis?: number };

/**
 * The pg driver adapter for a Prisma connection URL. pg ignores the URL's `schema` parameter
 * (default `public`), so it goes to the adapter, which names it in the queries Prisma generates,
 * and into every connection's search_path, as Prisma 6 did, so raw SQL sees the same tables.
 */
export function pgAdapter(connectionString: string, pool: PoolOptions = {}) {
  const schema = new URL(connectionString).searchParams.get('schema') || 'public';
  return new PrismaPg(
    { ...pool, connectionString, options: `-c search_path="${schema}"` },
    { schema },
  );
}

// One client for the whole process. Password hashes are omitted from every
// User read unless a query explicitly opts back in (login does).
// Prisma 7 reads no .env file and takes no URL from the schema: the URL comes from the
// configuration parsed in config/env.ts. The timeouts keep the 6.x behaviour: a query fails after
// 5 s when no connection can be made (so /health answers 503 promptly while the database is down),
// and idle connections are closed after 5 minutes.
function createClient() {
  return new PrismaClient({
    adapter: pgAdapter(env.DATABASE_URL, {
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 300_000,
    }),
    omit: { user: { password: true } },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
