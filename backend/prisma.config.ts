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
});
