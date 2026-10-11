import { defineConfig } from 'prisma/config';

// With a config file present, the Prisma CLI no longer loads .env on its own.
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the process environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // process.env rather than env() from prisma/config, which throws when the variable is unset:
  // `prisma generate` (postinstall, Docker build) runs without a database URL.
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    // Only `migrate diff --from-migrations` and `migrate dev` use it. Never the DATABASE_URL
    // database: the shadow database is wiped.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
