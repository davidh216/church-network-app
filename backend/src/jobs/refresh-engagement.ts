// Refreshes every member's engagement row and this month's snapshot, then exits: the same job as
// POST /api/analytics/members/engagement/refresh-all (PHASE3_SPECS.md 1.5, decision P3-D4), for a
// scheduler. It reads the API's environment (DATABASE_URL, JWT_SECRET, LOG_LEVEL; a .env file in
// the working directory is loaded when present) and exits 0 when every member was refreshed,
// 1 otherwise. Safe to run at any time and repeatedly: every write is an upsert.
//
// Built to dist/jobs/refresh-engagement.js by `npm run build`. Examples:
//   cron (nightly at 02:17):  17 2 * * *  cd /app/backend && node dist/jobs/refresh-engagement.js
//   compose (the image's entrypoint migrates and serves, so replace it for a one-off run):
//     docker compose run --rm --entrypoint node backend dist/jobs/refresh-engagement.js
//   development:              npx tsx src/jobs/refresh-engagement.ts
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { runEngagementRefresh } from '../modules/analytics/jobs';

async function main(): Promise<number> {
  const job = await runEngagementRefresh();
  return job.status === 'completed' && job.failed === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    logger.error({ err }, 'engagement refresh crashed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
