import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Deletes the audit events of the groups named `name` that a spec created and removed, so
 * church_dev keeps no trace of the run. The audit log has no delete route by design, so this runs
 * SQL through the Prisma CLI against the backend's DATABASE_URL (backend/.env locally, the
 * environment in CI). `name` is a constant of the spec, never user input.
 */
export function deleteGroupAuditEvents(name: string) {
  if (!/^[\w ]+$/.test(name)) throw new Error(`Unexpected group name ${name}`);
  execSync('npx -w backend prisma db execute --stdin', {
    cwd: path.join(__dirname, '..', '..'),
    input: `DELETE FROM "audit_events" WHERE "targetType" = 'group' AND "metadata"->>'name' = '${name}';`,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
}
