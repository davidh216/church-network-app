import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

// The seeded admin from `npm run -w backend db:seed`: SEED_ADMIN_* from the environment (CI),
// falling back to backend/.env (local development), normalised the way the seed script does.
export function seededAdmin(): { email: string; password: string } {
  let fileEnv: Record<string, string | undefined> = {};
  try {
    fileEnv = parseEnv(readFileSync(path.join(__dirname, '..', '..', 'backend', '.env'), 'utf8'));
  } catch {
    // No backend/.env: rely on the process environment.
  }
  const email = (process.env.SEED_ADMIN_EMAIL ?? fileEnv.SEED_ADMIN_EMAIL)?.trim().toLowerCase();
  const password = (process.env.SEED_ADMIN_PASSWORD ?? fileEnv.SEED_ADMIN_PASSWORD)?.trim();
  if (!email || !password) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (environment or backend/.env)');
  }
  return { email, password };
}
