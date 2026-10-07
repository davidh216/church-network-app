import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { createApp } from './app';
import { waitForEngagementRefresh } from './modules/analytics/jobs';

// How long shutdown waits for a running refresh-all job before disconnecting. It stays under the
// 10 s that `docker compose stop` allows before it kills the container.
const SHUTDOWN_JOB_WAIT_MS = 8_000;

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, 'server listening');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    void waitForEngagementRefresh(SHUTDOWN_JOB_WAIT_MS)
      .then((idle) => {
        if (!idle) logger.warn('shutting down while an engagement refresh job is still running');
      })
      .finally(() => prisma.$disconnect().finally(() => process.exit(0)));
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
