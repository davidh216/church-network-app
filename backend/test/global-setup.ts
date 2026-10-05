import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

// Fresh Postgres schema for every test run, created from the committed migrations.
// vitest's `test.env` is not applied to globalSetup, so the URL is set explicitly here (keep it in sync with
// vitest.config.mts); otherwise Prisma would fall back to DATABASE_URL from .env and wipe the dev database.
const TEST_DATABASE_URL = 'postgresql://church:church@localhost:5432/church_test?schema=public';

export default function setup() {
  const cwd = resolve(__dirname, '..');
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  execSync('npx prisma db execute --stdin --schema prisma/schema.prisma', {
    cwd,
    env,
    input: 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
}
