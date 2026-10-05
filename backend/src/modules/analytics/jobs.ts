import { randomUUID } from 'node:crypto';
import type { EngagementJob, EngagementJobStatus } from '@embrace/shared';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { loadScoringContext, updateMemberEngagement } from './service';

// The refresh-all job (PHASE3_SPECS.md 1.5, decision P3-D4): recalculates the engagement row and
// the current month's snapshot of every account, five members at a time. Every step is an upsert,
// so running it again (or twice in a month) gives the same rows. The API runs it in-process on
// request (POST /api/analytics/members/engagement/refresh-all) and keeps the status of its last
// jobs in memory (the last 20, for a single API instance) until it restarts;
// `node dist/jobs/refresh-engagement.js` runs it from a scheduler. There is no timer inside the API
// process.

export const REFRESH_CONCURRENCY = 5;
const KEPT_JOBS = 20;

interface JobState {
  jobId: string;
  status: EngagementJobStatus;
  processed: number;
  failed: number;
  skipped: number;
  total: number;
  startedAt: Date;
  finishedAt: Date | null;
}

const newJob = (): JobState => ({
  jobId: randomUUID(),
  status: 'running',
  processed: 0,
  failed: 0,
  skipped: 0,
  total: 0,
  startedAt: new Date(),
  finishedAt: null,
});

export const toJobResponse = (job: JobState): EngagementJob => ({
  ...job,
  startedAt: job.startedAt.toISOString(),
  finishedAt: job.finishedAt?.toISOString() ?? null,
});

/**
 * Refreshes every account (active or not: inactive accounts get the `inactive` stage), updating
 * `job` as it goes. A member deleted while the job runs is counted in `skipped`. A member whose
 * refresh fails for any other reason is logged and counted in `failed`; the job still completes.
 * It fails only when the member list or the scoring services cannot be read.
 */
export async function runEngagementRefresh(
  job: JobState = newJob(),
  concurrency = REFRESH_CONCURRENCY,
): Promise<JobState> {
  // One clock for the whole run, so every member is scored over the same windows and month.
  const now = job.startedAt;
  try {
    const users = await prisma.user.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
    job.total = users.length;
    // The scoring services are the same for every member: read them once per run.
    const context = await loadScoringContext(undefined, now);
    let next = 0;
    const worker = async () => {
      while (next < users.length) {
        const { id } = users[next++]!;
        try {
          await updateMemberEngagement(id, now, context);
        } catch (err) {
          if (await memberGone(id)) {
            job.skipped++;
            logger.info({ userId: id, jobId: job.jobId }, 'engagement refresh skipped: deleted');
          } else {
            job.failed++;
            logger.error({ err, userId: id, jobId: job.jobId }, 'engagement refresh failed');
          }
        }
        job.processed++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, users.length) }, worker));
    job.status = 'completed';
  } catch (err) {
    job.status = 'failed';
    logger.error({ err, jobId: job.jobId }, 'engagement refresh job failed');
  }
  job.finishedAt = new Date();
  logger.info(
    {
      jobId: job.jobId,
      status: job.status,
      processed: job.processed,
      failed: job.failed,
      skipped: job.skipped,
    },
    'engagement refresh job finished',
  );
  return job;
}

/** True when the member no longer exists (deleted after the run read the member list). */
async function memberGone(userId: string): Promise<boolean> {
  try {
    return (await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })) === null;
  } catch {
    return false;
  }
}

const jobs = new Map<string, JobState>();
let running: { job: JobState; done: Promise<JobState> } | null = null;

/**
 * Starts a refresh-all job in the background, or returns the one already running (`started`
 * false) so concurrent requests never refresh twice at once.
 */
export function startEngagementRefresh(): { job: JobState; started: boolean } {
  if (running) return { job: running.job, started: false };
  const job = newJob();
  jobs.set(job.jobId, job);
  for (const id of jobs.keys()) {
    if (jobs.size <= KEPT_JOBS) break;
    if (id !== job.jobId) jobs.delete(id);
  }
  const done = runEngagementRefresh(job).finally(() => {
    running = null;
  });
  running = { job, done };
  return { job, started: true };
}

export const getJob = (jobId: string): JobState | undefined => jobs.get(jobId);

/** Resolves when no refresh job is running (for tests and shutdown). */
export async function engagementRefreshIdle(): Promise<void> {
  while (running) await running.done;
}

/**
 * For shutdown: resolves true once no refresh job is running, or false after `timeoutMs` if one
 * is still running (the job is idempotent, so a later run repairs what it left).
 */
export async function waitForEngagementRefresh(timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([engagementRefreshIdle().then(() => true as const), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
