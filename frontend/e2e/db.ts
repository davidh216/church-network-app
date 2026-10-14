import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Deletes the audit events of the tags, groups or families named `name` that a spec created and
 * removed, so church_dev keeps no trace of the run. For a tag that includes its assignments to
 * members (events about the member that name the tag). The audit log has no delete route by design,
 * so this runs SQL through the Prisma CLI against the backend's DATABASE_URL (backend/.env
 * locally, the environment in CI). `name` is a constant of the spec, never user input.
 */
export function deleteAuditEvents(targetType: 'tag' | 'group' | 'family', name: string) {
  if (!/^[\w ]+$/.test(name)) throw new Error(`Unexpected ${targetType} name ${name}`);
  const assignments =
    targetType === 'tag'
      ? ` OR ("targetType" = 'user' AND "action" IN ('tag_assigned', 'tag_unassigned') AND "metadata"->>'tagName' = '${name}')`
      : '';
  execSync('npx -w backend prisma db execute --stdin', {
    cwd: path.join(__dirname, '..', '..'),
    input: `DELETE FROM "audit_events" WHERE ("targetType" = '${targetType}' AND "metadata"->>'name' = '${name}')${assignments};`,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
}
