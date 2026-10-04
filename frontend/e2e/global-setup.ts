import { execSync } from 'node:child_process';
import path from 'node:path';
import { seededAdmin } from './admin';

// Make sure the admin the smoke test logs in with exists (the seed is idempotent).
export default function globalSetup() {
  seededAdmin();
  execSync('npm run -w backend db:seed', {
    cwd: path.join(__dirname, '..', '..'),
    stdio: 'inherit',
  });
}
