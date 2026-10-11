import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { logger } from './logger';

// One log line per request with a per-request id (req.id), echoed in the X-Request-Id header
// so a 500's `requestId`, or any response a user reports, can be matched to its log line. The
// serializers keep method, URL and status only: no headers, bodies or query-string values that
// could hold emails or tokens.
export const createRequestLogger = (log: Logger) =>
  pinoHttp({
    logger: log,
    genReqId: (_req, res) => {
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        path: req.url.split('?')[0],
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });

export const requestLogger = createRequestLogger(logger);
