// Runs before every test file (vitest setupFiles). The generated Prisma client loads the .env
// beside the schema (backend/.env, when it existed at `prisma generate`) into process.env the
// first time @prisma/client is required, whichever module requires it first. Require it here
// and drop whatever it added, so test runs see only the environment from vitest.config.mts.
// Constructing a PrismaClient loads the file again; src/lib/prisma.ts therefore imports
// config/env.ts first, so the configuration is parsed before that happens.
const before = new Set(Object.keys(process.env));
await import('@prisma/client');
for (const name of Object.keys(process.env)) {
  if (!before.has(name)) delete process.env[name];
}
